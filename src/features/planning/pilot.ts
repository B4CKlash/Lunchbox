import {
  householdStateSchema,
  pilotCommandSchema,
  pilotStateSchema,
  type ActionReceipt,
  type CookingBatch,
  type HouseholdState,
  type MealAllocation,
  type PilotChange,
  type PilotCommand,
  type PilotOperation,
  type PilotState,
  type ShoppingItem,
  type Unit,
} from "@/lib/contracts";
import { addDays, localDate } from "./calendar";
import { directPlacementForRequest } from "./direct-placement";

export class PilotCommandError extends Error {
  constructor(
    public readonly code: "conflict" | "invalid" | "not-found" | "stale-proposal",
    message: string,
  ) {
    super(message);
    this.name = "PilotCommandError";
  }
}

type PilotHousehold = HouseholdState & { pilot: PilotState };
const keyFor = (ingredientId: string, unit: Unit) => JSON.stringify([ingredientId, unit]);
const round = (amount: number) => Math.round((amount + Number.EPSILON) * 1000) / 1000;
const occasion = (entry: { memberId: string; date: string; slot: string }) =>
  JSON.stringify([entry.memberId, entry.date, entry.slot]);
function fail(message: string): never { throw new PilotCommandError("invalid", message); }

/** Add the pilot without discarding any legacy kitchen, provenance, or history. */
export function ensurePilot(state: HouseholdState, today = localDate(new Date())): PilotHousehold {
  const current = householdStateSchema.parse(state);
  if (current.pilot) {
    validatePilot(current.pilot);
    return current as PilotHousehold;
  }
  const members = [{ id: "you", name: "You" }, { id: "partner", name: "Partner" }];
  const batches: CookingBatch[] = [];
  const allocations: MealAllocation[] = [];
  for (const [index, meal] of current.meals.entries()) {
    if (!meal.date || !meal.slot) continue;
    // Each saved entry is a distinct batch, including repeated recipe names.
    const batchId = `legacy-${index}-${meal.id.slice(0, 100)}`;
    batches.push({ id: batchId, recipe: meal.recipe, prepareDate: meal.date, yield: meal.servings, reservedExtra: 0, status: "planned" });
    members.forEach((member) => allocations.push({
      id: `${batchId}-${member.id}`, batchId, memberId: member.id,
      date: meal.date!, slot: meal.slot!, portions: meal.servings / members.length,
    }));
  }
  const startDate = current.workspace.calendar.startDate ?? today;
  const draft = current.workspace.calendar.draft;
  current.pilot = pilotStateSchema.parse({
    schemaVersion: 1, revision: 0, members, batches, allocations,
    coverage: [], stock: [], stockChecks: [], prepared: [], feedback: [], receipts: [],
    proposals: draft === null ? [] : [{
      id: "recovered-calendar-draft", title: "Recovered calendar draft", baseRevision: 0,
      changes: [], legacyMeals: draft, status: "pending",
    }],
    unplacedMeals: current.meals.filter((meal) => !meal.date),
    shopThrough: addDays(startDate, 6),
    session: {
      id: "household-planning", startDate, days: 7, slots: ["lunch", "dinner"],
      memberIds: members.map((member) => member.id),
      messages: current.workspace.chatMessages,
      candidates: current.workspace.focusedRecipe ? [current.workspace.focusedRecipe] : [],
      focusedRecipeId: current.workspace.focusedRecipe?.id ?? null,
      focusDate: null, focusSlot: null, rejectedRecipeIds: [], constraints: "", equipment: [],
      draft: current.workspace.chatDraft,
    },
  });
  validatePilot(current.pilot);
  return current as PilotHousehold;
}

/** Read all needs per person, including one person's externally covered meal. */
export function getMealCoverage(state: HouseholdState, date: string, slot: string) {
  const pilot = state.pilot ?? ensurePilot(state).pilot;
  return pilot.members.map((member) => {
    const coverage = pilot.coverage.find((entry) => entry.memberId === member.id && entry.date === date && entry.slot === slot);
    const allocation = pilot.allocations.find((entry) => entry.memberId === member.id && entry.date === date && entry.slot === slot);
    return { member, coverage, allocation, batch: pilot.batches.find((batch) => batch.id === allocation?.batchId) };
  });
}

export type PilotStockCheck = {
  ingredientId: string; name: string; unit: Unit; required: number;
  fingerprint: string; resolved: boolean;
};
export type PilotShoppingList = {
  shortages: ShoppingItem[]; checks: PilotStockCheck[]; batches: CookingBatch[];
};

function batchRequirements(batches: CookingBatch[]) {
  const requirements = new Map<string, { ingredientId: string; name: string; unit: Unit; required: number; sources: string[] }>();
  for (const batch of batches) {
    for (const ingredient of batch.recipe.ingredients) {
      const key = keyFor(ingredient.ingredientId, ingredient.unit);
      const existing = requirements.get(key) ?? { ...ingredient, required: 0, sources: [] };
      existing.required += ingredient.quantity * batch.yield / batch.recipe.servings;
      existing.sources.push(JSON.stringify([batch.id, batch.prepareDate, batch.yield, ingredient.quantity, batch.recipe.servings]));
      requirements.set(key, existing);
    }
  }
  return [...requirements.values()].map((entry) => ({ ...entry, required: round(entry.required) }));
}

function knownStock(state: PilotHousehold, ingredientId: string, unit: Unit) {
  const override = state.pilot.stock.find((entry) => entry.ingredientId === ingredientId && entry.unit === unit);
  if (override?.status === "some" || override?.status === "low") return { uncertain: true, available: 0, override };
  if (override?.status === "out") return { uncertain: false, available: 0, override };
  const available = round(state.pantry.filter((item) => item.id === ingredientId && item.unit === unit).reduce((sum, item) => sum + item.quantity, 0));
  return { uncertain: false, available, override };
}

/** One ingredient demand per uncooked batch, independent of calendar browsing. */
export function buildPilotShoppingList(state: HouseholdState): PilotShoppingList {
  const current = state.pilot ? state as PilotHousehold : ensurePilot(state);
  const batches = current.pilot.batches.filter((batch) => batch.status === "planned" && batch.prepareDate <= current.pilot.shopThrough);
  const shortages: ShoppingItem[] = [];
  const checks: PilotStockCheck[] = [];
  for (const required of batchRequirements(batches)) {
    const stock = knownStock(current, required.ingredientId, required.unit);
    if (stock.uncertain) {
      const fingerprint = JSON.stringify([required.ingredientId, required.unit, required.required, required.sources.sort(), stock.override]);
      checks.push({
        ingredientId: required.ingredientId, name: required.name, unit: required.unit,
        required: required.required, fingerprint,
        resolved: current.pilot.stockChecks.some((check) => check.ingredientId === required.ingredientId && check.unit === required.unit && check.fingerprint === fingerprint),
      });
    } else {
      const quantity = round(Math.max(0, required.required - stock.available));
      if (quantity > 0) shortages.push({ ingredientId: required.ingredientId, name: required.name, unit: required.unit, required: required.required, available: stock.available, quantity });
    }
  }
  return { shortages, checks, batches };
}

function validatePilot(pilot: PilotState) {
  const unique = (items: { id: string }[], label: string) => {
    if (new Set(items.map((item) => item.id)).size !== items.length) fail(`${label} must have unique IDs.`);
  };
  unique(pilot.members, "Household members");
  unique(pilot.batches, "Cooking batches");
  unique(pilot.allocations, "Meal allocations");
  unique(pilot.coverage, "Covered meals");
  unique(pilot.proposals, "Proposals");
  unique(pilot.feedback, "Feedback entries");
  unique(pilot.receipts, "Receipts");
  unique(pilot.purchaseLots, "Purchase lots");
  if (new Set(pilot.prepared.map((entry) => entry.batchId)).size !== pilot.prepared.length) fail("A batch has only one prepared balance.");
  if (new Set(pilot.stock.map((entry) => keyFor(entry.ingredientId, entry.unit))).size !== pilot.stock.length) fail("Stock entries must have unique ingredient and unit pairs.");
  if (new Set(pilot.stockChecks.map((entry) => keyFor(entry.ingredientId, entry.unit))).size !== pilot.stockChecks.length) fail("Stock checks must have unique ingredient and unit pairs.");
  const members = new Set(pilot.members.map((member) => member.id));
  const occupied = new Set<string>();
  for (const entry of [...pilot.coverage, ...pilot.allocations]) {
    if (!members.has(entry.memberId)) fail("Choose a current household member.");
    const key = occasion(entry);
    if (occupied.has(key)) fail("This person's meal is already covered. Clear it before placing another meal.");
    occupied.add(key);
  }
  for (const allocation of pilot.allocations) {
    const batch = pilot.batches.find((entry) => entry.id === allocation.batchId);
    if (!batch) fail("Every allocation needs an existing cooking batch.");
    if (allocation.date < batch.prepareDate) fail("A meal cannot precede its preparation date.");
    if (allocation.consumedAt && batch.status !== "cooked") fail("Cook the batch before recording a meal as eaten.");
  }
  for (const batch of pilot.batches) {
    const allocations = pilot.allocations.filter((entry) => entry.batchId === batch.id);
    const allocated = allocations.reduce((sum, entry) => sum + entry.portions, 0);
    const prepared = pilot.prepared.find((entry) => entry.batchId === batch.id);
    if (batch.status === "planned") {
      if (allocated + batch.reservedExtra > batch.yield + 0.000001) fail("Allocations and reserved extras exceed this batch's yield.");
      if (prepared) fail("Uncooked food cannot have a prepared balance.");
    } else {
      if (!prepared) fail("Cooked batches need a prepared balance.");
      if (prepared.produced === 0 && allocations.length) fail("A zero-portion batch cannot retain eaten or pending meals.");
      const pending = allocations.filter((entry) => !entry.consumedAt).reduce((sum, entry) => sum + entry.portions, 0);
      const eaten = allocations.filter((entry) => entry.consumedAt).reduce((sum, entry) => sum + entry.portions, 0);
      if (Math.abs(eaten - prepared.consumed) > 0.000001) fail("Prepared food consumption must match recorded eaten allocations.");
      if (prepared.consumed + pending > prepared.produced + 0.000001) fail("Not enough prepared portions remain for these meals.");
      if (prepared.freezerPortions > prepared.produced - prepared.consumed + 0.000001) fail("Freezer portions exceed the remaining prepared food.");
    }
  }
  if (pilot.prepared.some((entry) => !pilot.batches.some((batch) => batch.id === entry.batchId && batch.status === "cooked"))) fail("Prepared portions need a cooked batch.");
  if (pilot.session.memberIds.some((id) => !members.has(id))) fail("Planning sessions must use current household members.");
  if (new Set(pilot.session.memberIds).size !== pilot.session.memberIds.length || new Set(pilot.session.slots).size !== pilot.session.slots.length) fail("Choose each member and meal slot once.");
  if (pilot.feedback.some((entry) => entry.memberId && !members.has(entry.memberId))) fail("Feedback must use a current household member.");
}

function removeAllocation(pilot: PilotState, allocationId: string) {
  const allocation = pilot.allocations.find((entry) => entry.id === allocationId);
  if (!allocation) throw new PilotCommandError("not-found", "That meal allocation is no longer available.");
  if (allocation.consumedAt) fail("An eaten meal is history. Undo its consumption before removing it.");
  pilot.allocations = pilot.allocations.filter((entry) => entry.id !== allocationId);
  const batch = pilot.batches.find((entry) => entry.id === allocation.batchId)!;
  if (batch.status === "planned") {
    batch.yield = round(pilot.allocations.filter((entry) => entry.batchId === batch.id).reduce((sum, entry) => sum + entry.portions, 0) + batch.reservedExtra);
    if (batch.yield === 0) pilot.batches = pilot.batches.filter((entry) => entry.id !== batch.id);
  }
}

function setPantryBalance(state: PilotHousehold, ingredientId: string, name: string, unit: Unit, quantity: number) {
  const existing = state.pantry.find((entry) => entry.id === ingredientId && entry.unit === unit);
  state.pantry = state.pantry.filter((entry) => !(entry.id === ingredientId && entry.unit === unit));
  state.pantry.push(existing ? { ...existing, quantity: round(quantity) } : {
    id: ingredientId, name, unit, quantity: round(quantity), location: "Cupboard", useSoon: false, tag: "special",
  });
  const override = state.pilot.stock.find((entry) => entry.ingredientId === ingredientId && entry.unit === unit);
  if (override?.status === "exact") override.quantity = round(quantity);
}

function applyChange(state: PilotHousehold, change: PilotChange, now: string, commandId: string, changeIndex: number | string) {
  const pilot = state.pilot;
  switch (change.type) {
    case "set_coverage": {
      const key = occasion(change.coverage);
      for (const allocation of pilot.allocations.filter((entry) => occasion(entry) === key)) removeAllocation(pilot, allocation.id);
      pilot.coverage = pilot.coverage.filter((entry) => entry.id !== change.coverage.id && occasion(entry) !== key);
      pilot.coverage.push(change.coverage);
      break;
    }
    case "clear_coverage":
      if (!pilot.coverage.some((entry) => entry.id === change.coverageId)) throw new PilotCommandError("not-found", "That covered meal is no longer available.");
      pilot.coverage = pilot.coverage.filter((entry) => entry.id !== change.coverageId);
      break;
    case "create_batch":
      if (change.allocations.some((allocation) => allocation.batchId !== change.batch.id)) fail("New allocations must refer to the new batch.");
      pilot.batches.push({ ...change.batch, status: "planned" });
      pilot.allocations.push(...change.allocations);
      break;
    case "allocate":
      pilot.allocations.push(change.allocation);
      break;
    case "remove_allocation":
      removeAllocation(pilot, change.allocationId);
      break;
    case "remove_batch": {
      const batch = pilot.batches.find((entry) => entry.id === change.batchId);
      if (!batch) throw new PilotCommandError("not-found", "That cooking batch is no longer available.");
      if (batch.status === "cooked") fail("Cooked food remains in inventory. Remove its future allocations instead.");
      pilot.batches = pilot.batches.filter((entry) => entry.id !== change.batchId);
      pilot.allocations = pilot.allocations.filter((entry) => entry.batchId !== change.batchId);
      break;
    }
    case "set_shop_through":
      pilot.shopThrough = change.date;
      break;
    case "set_stock": {
      const stock = change.stock;
      pilot.stock = pilot.stock.filter((entry) => keyFor(entry.ingredientId, entry.unit) !== keyFor(stock.ingredientId, stock.unit));
      pilot.stock.push(stock);
      pilot.stockChecks = pilot.stockChecks.filter((entry) => keyFor(entry.ingredientId, entry.unit) !== keyFor(stock.ingredientId, stock.unit));
      if (stock.status === "exact" || stock.status === "out") setPantryBalance(state, stock.ingredientId, stock.name, stock.unit, stock.quantity ?? 0);
      break;
    }
    case "confirm_stock": {
      const check = buildPilotShoppingList(state).checks.find((entry) => entry.ingredientId === change.ingredientId && entry.unit === change.unit);
      if (!check || check.fingerprint !== change.fingerprint) throw new PilotCommandError("conflict", "That stock requirement changed. Review the current check first.");
      pilot.stockChecks = pilot.stockChecks.filter((entry) => keyFor(entry.ingredientId, entry.unit) !== keyFor(change.ingredientId, change.unit));
      pilot.stockChecks.push({ ingredientId: change.ingredientId, unit: change.unit, fingerprint: change.fingerprint });
      break;
    }
    case "record_stock_entries": {
      const seen = new Map<string, "set-total" | "add">();
      for (const entry of change.entries) {
        const key = keyFor(entry.item.id, entry.item.unit);
        const previous = seen.get(key);
        if (previous && (previous === "set-total" || entry.intent === "set-total"))
          fail(`Enter one current total for ${entry.item.name} (${entry.item.unit}), or record purchases separately.`);
        seen.set(key, entry.intent);
      }
      for (const [index, entry] of change.entries.entries()) {
        const { item } = entry;
        if (entry.intent === "set-total") {
          const previous = pilot.stock.find((stock) => keyFor(stock.ingredientId, stock.unit) === keyFor(item.id, item.unit));
          applyChange(state, { type: "set_stock", stock: {
            ...previous, ingredientId: item.id, name: item.name, unit: item.unit,
            status: "exact", quantity: item.quantity, useSoon: item.useSoon,
          } }, now, commandId, `${changeIndex}:entry:${index}`);
        } else {
          applyChange(state, { type: "record_purchase", items: [{
            ingredientId: item.id, name: item.name, unit: item.unit, quantity: item.quantity,
          }] }, now, commandId, `${changeIndex}:entry:${index}`);
          const override = pilot.stock.find((stock) => keyFor(stock.ingredientId, stock.unit) === keyFor(item.id, item.unit));
          if (override) override.useSoon = item.useSoon;
        }
        // Both underlying commands collapse the canonical balance. Keep the
        // reviewed pantry details without treating a purchase as a measurement.
        state.pantry = state.pantry.map((stock) => keyFor(stock.id, stock.unit) === keyFor(item.id, item.unit)
          ? { ...item, quantity: stock.quantity } : stock);
      }
      break;
    }
    case "record_purchase":
      if (pilot.purchaseLots.length + change.items.length > 10000) fail("The purchase history is full. Export and archive it before recording more purchases.");
      for (const [itemIndex, item] of change.items.entries()) {
        const stock = knownStock(state, item.ingredientId, item.unit);
        // Unknown prior stock stays unknown. The exact purchase is retained in
        // the command receipt; it never invents the prior pantry balance.
        const existing = state.pantry.filter((entry) => entry.id === item.ingredientId && entry.unit === item.unit).reduce((sum, entry) => sum + entry.quantity, 0);
        setPantryBalance(state, item.ingredientId, item.name, item.unit, (stock.override?.status === "out" ? 0 : existing) + item.quantity);
        if (stock.override?.status === "out") {
          stock.override.status = "exact";
          stock.override.quantity = item.quantity;
        }
        pilot.stockChecks = pilot.stockChecks.filter((entry) => keyFor(entry.ingredientId, entry.unit) !== keyFor(item.ingredientId, item.unit));
        pilot.purchaseLots.push({ ...item, id: `${commandId}:purchase:${changeIndex}:${itemIndex}`, commandId, recordedAt: now });
      }
      break;
    case "cook_batch": {
      const batch = pilot.batches.find((entry) => entry.id === change.batchId);
      if (!batch) throw new PilotCommandError("not-found", "That cooking batch is no longer available.");
      if (batch.status === "cooked") fail("This batch has already been cooked.");
      const pending = pilot.allocations.filter((entry) => entry.batchId === batch.id).reduce((sum, entry) => sum + entry.portions, 0);
      if (change.actualPortions < pending) fail("Actual portions cannot be fewer than allocated meals. Adjust allocations first.");
      if (change.freezerPortions > change.actualPortions) fail("Freezer portions cannot exceed the portions produced.");
      for (const ingredient of batchRequirements([batch])) {
        const stock = knownStock(state, ingredient.ingredientId, ingredient.unit);
        if (!stock.uncertain && stock.available + 0.000001 < ingredient.required) fail(`Confirm or purchase enough ${ingredient.name} before cooking.`);
        if (!stock.uncertain) setPantryBalance(state, ingredient.ingredientId, ingredient.name, ingredient.unit, Math.max(0, stock.available - ingredient.required));
        // Unknown inventory stays qualitative after confirmed ingredient use.
        pilot.stockChecks = pilot.stockChecks.filter((entry) => keyFor(entry.ingredientId, entry.unit) !== keyFor(ingredient.ingredientId, ingredient.unit));
      }
      batch.status = "cooked";
      pilot.prepared.push({ batchId: batch.id, produced: change.actualPortions, consumed: 0, freezerPortions: change.freezerPortions, cookedAt: now, ingredientUses: batchRequirements([batch]).map((entry) => ({ ingredientId: entry.ingredientId, name: entry.name, unit: entry.unit, quantity: entry.required })) });
      break;
    }
    case "correct_prepared": {
      const batch = pilot.batches.find((entry) => entry.id === change.batchId);
      const prepared = pilot.prepared.find((entry) => entry.batchId === change.batchId);
      if (!batch || batch.status !== "cooked" || !prepared) fail("Choose an existing cooked batch to correct.");
      const reopened = new Set(change.reopenAllocationIds);
      if (reopened.size !== change.reopenAllocationIds.length) fail("Choose each eaten meal to reopen only once.");
      for (const allocationId of reopened) {
        const allocation = pilot.allocations.find((entry) => entry.id === allocationId);
        if (!allocation || allocation.batchId !== batch.id || !allocation.consumedAt) fail("Only an eaten meal from this batch can be reopened.");
        delete allocation.consumedAt;
      }
      const allocations = pilot.allocations.filter((entry) => entry.batchId === batch.id);
      if (change.produced === 0 && allocations.length) fail("Remove pending meals and correct eaten meals before setting the produced total to zero.");
      const consumed = round(allocations.filter((entry) => entry.consumedAt).reduce((sum, entry) => sum + entry.portions, 0));
      const pending = round(allocations.filter((entry) => !entry.consumedAt).reduce((sum, entry) => sum + entry.portions, 0));
      if (change.produced + 0.000001 < consumed + pending) fail("The corrected total cannot be below portions already eaten or allocated. Adjust pending allocations first.");
      if (change.freezerPortions > change.produced - consumed + 0.000001) fail("Corrected freezer portions cannot exceed the food remaining.");
      // These are confirmed current portion counts. Do not reconstruct pantry
      // quantities, alter recorded ingredient use, or infer a freezer source
      // for reopened meals from incomplete historical information.
      prepared.produced = change.produced;
      prepared.consumed = consumed;
      prepared.freezerPortions = change.freezerPortions;
      break;
    }
    case "consume": {
      const allocation = pilot.allocations.find((entry) => entry.id === change.allocationId);
      if (!allocation) throw new PilotCommandError("not-found", "That meal allocation is no longer available.");
      if (allocation.consumedAt) fail("This meal has already been recorded as eaten.");
      const prepared = pilot.prepared.find((entry) => entry.batchId === allocation.batchId);
      if (!prepared) fail("Cook this batch before recording a meal as eaten.");
      if (change.fromFreezer) {
        if (prepared.freezerPortions < allocation.portions) fail("Not enough freezer portions remain.");
        prepared.freezerPortions = round(prepared.freezerPortions - allocation.portions);
      } else if (prepared.produced - prepared.consumed - prepared.freezerPortions < allocation.portions) {
        fail("These portions are reserved in the freezer. Choose to use freezer portions.");
      }
      prepared.consumed = round(prepared.consumed + allocation.portions);
      allocation.consumedAt = now;
      break;
    }
    case "record_feedback":
      pilot.feedback = pilot.feedback.filter((entry) => entry.id !== change.feedback.id);
      pilot.feedback.push(change.feedback);
      break;
    case "set_members":
      pilot.members = change.members;
      pilot.session.memberIds = pilot.session.memberIds.filter((id) => change.members.some((member) => member.id === id));
      if (!pilot.session.memberIds.length) pilot.session.memberIds = change.members.map((member) => member.id);
      break;
  }
}

function summaryFor(operation: PilotOperation) {
  switch (operation.type) {
    case "set_coverage": return `Marked ${operation.coverage.slot} on ${operation.coverage.date} as ${operation.coverage.reason.replaceAll("-", " ")}.`;
    case "create_batch": return `Planned ${operation.batch.yield} portions of ${operation.batch.recipe.name}.`;
    case "record_purchase": return `Recorded ${operation.items.length} purchased ingredient${operation.items.length === 1 ? "" : "s"}.`;
    case "record_stock_entries": {
      const totals = operation.entries.filter((entry) => entry.intent === "set-total").length;
      const purchases = operation.entries.length - totals;
      return `Saved ${totals} measured total${totals === 1 ? "" : "s"} and ${purchases} purchase${purchases === 1 ? "" : "s"}.`;
    }
    case "cook_batch": return `Recorded cooking: ${operation.actualPortions} portions, including ${operation.freezerPortions} for the freezer.`;
    case "correct_prepared": return `Corrected prepared food: ${operation.produced} total portions, ${operation.freezerPortions} remaining in the freezer${operation.reopenAllocationIds.length ? `; reopened ${operation.reopenAllocationIds.length} meal${operation.reopenAllocationIds.length === 1 ? "" : "s"}` : ""}.`;
    case "record_feedback": return "Saved recipe feedback for future planning.";
    case "set_session": return "Saved the planning conversation and recipe candidates.";
    case "receive_planning_result": return operation.directPlacement ? "Placed the requested recipe and saved the assistant response." : operation.proposal ? "Saved the assistant response and its reviewable proposal." : "Saved the assistant response and recipe candidates.";
    case "propose": return `Prepared proposal: ${operation.title}.`;
    case "apply_proposal": return "Applied the reviewed planning proposal.";
    case "dismiss_proposal": return "Dismissed the planning proposal.";
    case "undo": return "Undid the latest action.";
    default: return `${operation.type.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())} applied.`;
  }
}

/** Derive exactly the reviewed placements while retaining one cooking batch.
 * Non-placement effects require their own explicit opt-in in a partial review.
 */
export function selectProposalChanges(changes: PilotChange[], selectedAllocationIds?: string[], includeOtherChanges?: boolean): PilotChange[] {
  if (selectedAllocationIds === undefined) return structuredClone(changes);
  if (includeOtherChanges === undefined) fail("Choose whether to include the proposal's other changes.");
  const available = changes.flatMap((change) => change.type === "create_batch" ? change.allocations.map((entry) => entry.id) : change.type === "allocate" ? [change.allocation.id] : []);
  if (new Set(available).size !== available.length) fail("The proposal has ambiguous meal placement IDs. Request an updated proposal.");
  const selected = new Set(selectedAllocationIds);
  if (selected.size !== selectedAllocationIds.length || selectedAllocationIds.some((id) => !available.includes(id))) fail("Choose each meal placement once from this proposal.");
  const result: PilotChange[] = [];
  for (const change of changes) {
    if (change.type === "create_batch") {
      const allocations = change.allocations.filter((entry) => selected.has(entry.id));
      if (!allocations.length && (!includeOtherChanges || change.batch.reservedExtra === 0)) continue;
      const yieldPortions = round(allocations.reduce((sum, entry) => sum + entry.portions, 0) + change.batch.reservedExtra);
      if (yieldPortions > 0) result.push({ ...structuredClone(change), batch: { ...structuredClone(change.batch), yield: yieldPortions }, allocations: structuredClone(allocations) });
    } else if (change.type === "allocate") {
      if (selected.has(change.allocation.id)) result.push(structuredClone(change));
    } else if (includeOtherChanges) result.push(structuredClone(change));
  }
  if (!result.length) fail("Select a meal placement or another proposed change before applying.");
  return result;
}

function invalidateRevisedPlanningProposals(pilot: PilotState, previousSession: PilotState["session"]) {
  const ordered = (values: string[]) => JSON.stringify([...values].sort());
  const changedRequirements = previousSession.constraints.trim() !== pilot.session.constraints.trim()
    || ordered(previousSession.equipment) !== ordered(pilot.session.equipment)
    || ordered(previousSession.memberIds) !== ordered(pilot.session.memberIds);
  const changedCandidates = new Set(previousSession.candidates.filter((previous) => {
    const next = pilot.session.candidates.find((candidate) => candidate.id === previous.id);
    return !next || JSON.stringify(previous) !== JSON.stringify(next);
  }).map((candidate) => candidate.id));
  for (const id of pilot.session.rejectedRecipeIds) {
    if (!previousSession.rejectedRecipeIds.includes(id)) changedCandidates.add(id);
  }
  for (const proposal of pilot.proposals) {
    if (proposal.status === "pending" && (changedRequirements || proposal.changes.some((change) => change.type === "create_batch" && changedCandidates.has(change.batch.recipe.id)))) proposal.status = "stale";
  }
}

/** Same validated, atomic command path for manual controls and agent tools. */
export function applyPilotCommand(
  state: HouseholdState,
  input: unknown,
  { now = new Date().toISOString() }: { now?: string } = {},
): { state: PilotHousehold; receipt: ActionReceipt; duplicate: boolean } {
  const parsed = pilotCommandSchema.safeParse(input);
  if (!parsed.success) throw new PilotCommandError("invalid", parsed.error.issues[0]?.message ?? "Invalid planning command.");
  const command: PilotCommand = parsed.data;
  const current = ensurePilot(state);
  const fingerprint = JSON.stringify(command.operation);
  const existing = current.pilot.receipts.find((receipt) => receipt.commandId === command.id);
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new PilotCommandError("conflict", "This command ID was already used for another action.");
    return { state: current, receipt: existing, duplicate: true };
  }
  if (command.expectedRevision !== current.pilot.revision) throw new PilotCommandError("conflict", "The household changed on another device. Refresh before applying this action.");
  if (current.pilot.receipts.length >= 10000) fail("The household command history is full. Export and archive it before applying more changes.");
  validatePilot(current.pilot);
  const { receipts: oldReceipts, revision, ...data } = current.pilot;
  const inverse = { pantry: structuredClone(current.pantry), data: structuredClone(data) };
  const operation = command.operation;
  let changeIndex = 0;
  const apply = (target: PilotHousehold, change: PilotChange) => applyChange(target, change, now, command.id, changeIndex++);
  if (operation.type === "receive_planning_result" && operation.baseRevision !== revision) {
    throw new PilotCommandError("conflict", "The household changed after this assistant request. Refresh its suggestions before saving them.");
  }
  const directPlacement = operation.type === "receive_planning_result" && operation.directPlacement
    ? directPlacementForRequest(current, operation.directPlacement.request, operation.directPlacement.actorMemberId, [operation.directPlacement.change]) : null;
  if (operation.type === "receive_planning_result" && operation.directPlacement && !directPlacement) fail("This response needs a proposal review before changing the calendar.");
  const sessionOnly = operation.type === "set_session" || (operation.type === "receive_planning_result" && !operation.proposal && !operation.directPlacement);
  if (operation.type === "undo") {
    const last = oldReceipts.findLast((entry) => entry.inverse);
    if (!last || last.id !== operation.receiptId || !last.inverse || last.undoneBy || last.undoRevision !== revision) {
      throw new PilotCommandError("conflict", "Only the latest unchanged action can be undone. Newer edits are preserved.");
    }
    current.pantry = structuredClone(last.inverse.pantry);
    current.pilot = { ...structuredClone(last.inverse.data), session: current.pilot.session, revision, receipts: oldReceipts };
    invalidateRevisedPlanningProposals(current.pilot, last.inverse.data.session);
    for (const proposal of current.pilot.proposals) {
      if (proposal.status === "pending" && proposal.baseRevision === last.revision - 1) proposal.baseRevision = revision + 1;
    }
    last.undoneBy = command.id;
  } else if (operation.type === "set_session" || operation.type === "receive_planning_result") {
    const previousSession = current.pilot.session;
    current.pilot.session = operation.session;
    invalidateRevisedPlanningProposals(current.pilot, previousSession);
    if (directPlacement) apply(current, directPlacement);
    if (operation.type === "receive_planning_result" && operation.proposal) {
      const proposal = operation.proposal;
      if (current.pilot.proposals.some((entry) => entry.id === proposal.id)) fail("This proposal ID already exists.");
      const preview = structuredClone(current);
      for (const change of proposal.changes) { apply(preview, change); validatePilot(preview.pilot); }
      householdStateSchema.parse(preview);
      current.pilot.proposals.push({ ...proposal, baseRevision: revision + 1, status: "pending" });
    }
    for (const proposal of current.pilot.proposals) {
      if (sessionOnly && proposal.status === "pending" && proposal.baseRevision === revision) proposal.baseRevision = revision + 1;
    }
    for (const previous of oldReceipts) {
      if (sessionOnly && previous.inverse && previous.undoRevision === revision) previous.undoRevision = revision + 1;
    }
  } else if (operation.type === "propose") {
    if (current.pilot.proposals.some((entry) => entry.id === operation.id)) fail("This proposal ID already exists.");
    // Validate the proposed result without applying it to the live household.
    const preview = structuredClone(current);
    for (const change of operation.changes) { apply(preview, change); validatePilot(preview.pilot); }
    householdStateSchema.parse(preview);
    current.pilot.proposals.push({ id: operation.id, title: operation.title, baseRevision: revision + 1, changes: operation.changes, status: "pending" });
  } else if (operation.type === "dismiss_proposal") {
    if (!current.pilot.proposals.some((entry) => entry.id === operation.proposalId)) throw new PilotCommandError("not-found", "This proposal is no longer available.");
    current.pilot.proposals = current.pilot.proposals.filter((entry) => entry.id !== operation.proposalId);
    for (const proposal of current.pilot.proposals) {
      if (proposal.status === "pending" && proposal.baseRevision === revision) proposal.baseRevision = revision + 1;
    }
  } else if (operation.type === "apply_proposal") {
    const proposal = current.pilot.proposals.find((entry) => entry.id === operation.proposalId);
    if (!proposal) throw new PilotCommandError("not-found", "This proposal is no longer available.");
    if (proposal.status !== "pending" || proposal.baseRevision !== revision) throw new PilotCommandError("stale-proposal", "The household changed after this proposal. Review a refreshed proposal before applying it.");
    if (proposal.legacyMeals) fail("Recovered drafts are preserved for review. Recreate their placements in the live calendar before applying them.");
    const selectedChanges = selectProposalChanges(proposal.changes, operation.selectedAllocationIds, operation.includeOtherChanges);
    for (const change of selectedChanges) { apply(current, change); validatePilot(current.pilot); }
    proposal.status = "applied";
  } else {
    apply(current, operation);
  }
  current.pilot.revision = revision + 1;
  for (const proposal of current.pilot.proposals) {
    if (proposal.status === "pending" && proposal.baseRevision !== current.pilot.revision) proposal.status = "stale";
  }
  // Retain IDs and descriptions indefinitely within the explicit bound. Only
  // one before-state is needed because undo refuses intervening edits.
  if (!sessionOnly) {
    for (const receipt of current.pilot.receipts) delete receipt.inverse;
  }
  const receipt: ActionReceipt = {
    id: command.id, commandId: command.id, operationType: operation.type,
    fingerprint, summary: summaryFor(operation), revision: current.pilot.revision, createdAt: now,
    ...(operation.type === "undo" || sessionOnly ? {} : { inverse, undoRevision: current.pilot.revision }),
  };
  current.pilot.receipts.push(receipt);
  validatePilot(current.pilot);
  const validated = householdStateSchema.parse(current) as PilotHousehold;
  return { state: validated, receipt: validated.pilot.receipts.at(-1)!, duplicate: false };
}
