import { recipeSchema, type MealSlot, type PantryCategory, type PilotOperation, type ProfileFactChange, type Recipe } from "@/lib/contracts";
import type { LocalPlanningResult } from "./local-planner";
import { claimsCompletedAction } from "./planning-claims";
import { inferPantryCategory } from "@/features/pantry/categories";

export const planningEvaluationVersion = "exact-effects-v3-knowledge";
export const originalPlanningScenarioNames = [
  "individual work lunch", "retrieve favorite", "new vegetable recipe", "revise preparation effort", "revise cuisine",
  "one batch three meals", "specific placement", "broad lunch proposal", "individual eating out", "record purchase",
  "record cooking and freezer", "schedule prepared portions", "record consumption", "rating and notes", "qualitative stock",
  "explicit shopping horizon", "no date-driven consumption", "purchase missing quantity", "unsupported unit conversion", "completed action claim attack",
] as const;
const date = { monday: "2026-10-12", tuesday: "2026-10-13", wednesday: "2026-10-14", thursday: "2026-10-15", friday: "2026-10-16" };
const noActions = (result: LocalPlanningResult) => result.operations.length === 0;
const noCandidates = (result: LocalPlanningResult) => result.recipes.length === 0;
const oneCandidate = (result: LocalPlanningResult, favorite: Recipe) => noActions(result) && result.recipes.length === 1 && result.recipes[0].id !== favorite.id && result.recipes[0].provenance?.source === "ai";
const ingredient = (recipe: Recipe, ingredientId: string, unit: string) => recipe.ingredients.some((entry) => entry.ingredientId === ingredientId && entry.unit === unit && entry.quantity > 0);
const snapshot = (recipe: Recipe) => JSON.stringify(recipeSchema.parse(recipe));
const sameRecipe = (left: Recipe, right: Recipe) => snapshot(left) === snapshot(right);
const normalized = (text: string) => text.trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
type AllocationTarget = { memberId: string; date: string; slot: MealSlot; portions: number };
const allocationKey = (target: AllocationTarget) => `${target.memberId}|${target.date}|${target.slot}|${target.portions}`;

function oneOperation<T extends PilotOperation["type"]>(result: LocalPlanningResult, type: T): Extract<PilotOperation, { type: T }> | null {
  return noCandidates(result) && result.operations.length === 1 && result.operations[0].type === type ? result.operations[0] as Extract<PilotOperation, { type: T }> : null;
}

function requestedBatch(result: LocalPlanningResult, favorite: Recipe, occasions: { date: string; slot: MealSlot }[], prepareDate?: string) {
  // A card showing the unchanged selected favorite is presentation, not a new
  // candidate. Generated duplicates or unrelated recipe cards are collateral.
  if (!noCandidates(result) && !(result.recipes.length === 1 && sameRecipe(result.recipes[0], favorite))) return false;
  const operation = oneOperation({ ...result, recipes: [] }, "create_batch");
  if (!operation || !sameRecipe(operation.batch.recipe, favorite) || operation.batch.yield !== occasions.length * 2 || operation.batch.reservedExtra !== 0) return false;
  if (prepareDate ? operation.batch.prepareDate !== prepareDate : operation.batch.prepareDate > occasions[0].date) return false;
  const expected = ["you", "partner"].flatMap((memberId) => occasions.map((occasion) => allocationKey({ memberId, ...occasion, portions: 1 }))).sort();
  const actual = operation.allocations.map(allocationKey).sort();
  return JSON.stringify(actual) === JSON.stringify(expected) && operation.allocations.every((allocation) => allocation.batchId === operation.batch.id);
}

/** Completion measures the requested effects, not merely the presence of one matching action. */
export function acceptsPlanningScenario(name: string, result: LocalPlanningResult, favorite: Recipe): boolean {
  if (result.profileChanges?.length) return false;
  switch (name) {
    case "individual work lunch": {
      const operation = oneOperation(result, "set_coverage");
      return Boolean(operation && operation.coverage.memberId === "partner" && operation.coverage.date === date.tuesday && operation.coverage.slot === "lunch" && operation.coverage.reason === "work");
    }
    case "retrieve favorite":
      return noActions(result) && result.recipes.length === 1 && sameRecipe(result.recipes[0], favorite);
    case "new vegetable recipe":
      return oneCandidate(result, favorite) && ingredient(result.recipes[0], "zucchini", "g") && ingredient(result.recipes[0], "carrot", "g");
    case "revise preparation effort": {
      const candidate = result.recipes[0];
      return oneCandidate(result, favorite) && candidate.minutes <= 15 && candidate.minutes < favorite.minutes && ingredient(candidate, "pasta", "g") && JSON.stringify(candidate.steps.map(normalized)) !== JSON.stringify(favorite.steps.map(normalized));
    }
    case "revise cuisine": {
      const candidate = result.recipes[0];
      return oneCandidate(result, favorite) && ["pasta", "spinach", "tomatoes"].every((id) => ingredient(candidate, id, "g")) && candidate.ingredients.some((entry) => /cumin|chil[li]+|lime|cilantro|coriander|jalape[nñ]o|chipotle|mexican|taco|ancho|guajillo|epazote|poblano/i.test(`${entry.ingredientId} ${entry.name}`)) && JSON.stringify(candidate.steps.map(normalized)) !== JSON.stringify(favorite.steps.map(normalized));
    }
    case "one batch three meals":
      return requestedBatch(result, favorite, [{ date: date.monday, slot: "dinner" }, { date: date.tuesday, slot: "lunch" }, { date: date.wednesday, slot: "lunch" }], date.monday);
    case "specific placement":
      return requestedBatch(result, favorite, [{ date: date.tuesday, slot: "lunch" }]);
    case "broad lunch proposal":
      return requestedBatch(result, favorite, [{ date: date.tuesday, slot: "lunch" }, { date: date.wednesday, slot: "lunch" }, { date: date.thursday, slot: "lunch" }]);
    case "individual eating out": {
      if (!noCandidates(result)) return false;
      const coverage = result.operations.filter((operation) => operation.type === "set_coverage");
      const removals = result.operations.filter((operation) => operation.type === "remove_allocation");
      return coverage.length === 1 && coverage[0].coverage.memberId === "you" && coverage[0].coverage.date === date.tuesday && coverage[0].coverage.slot === "lunch" && coverage[0].coverage.reason === "eating-out" && removals.length <= 1 && removals.every((operation) => operation.allocationId === "tuesday-lunch") && result.operations.length === coverage.length + removals.length;
    }
    case "record purchase": {
      const operation = oneOperation(result, "record_purchase");
      return Boolean(operation && operation.items.length === 1 && operation.items[0].ingredientId === "pasta" && operation.items[0].quantity === 500 && operation.items[0].unit === "g");
    }
    case "record cooking and freezer": {
      const operation = oneOperation(result, "cook_batch");
      return Boolean(operation && operation.batchId === "pasta-batch" && operation.actualPortions === 6 && operation.freezerPortions === 2);
    }
    case "schedule prepared portions": {
      const operation = oneOperation(result, "allocate");
      return Boolean(operation && operation.allocation.batchId === "pasta-batch" && allocationKey(operation.allocation) === allocationKey({ memberId: "partner", date: date.friday, slot: "dinner", portions: 2 }));
    }
    case "record consumption": {
      const operation = oneOperation(result, "consume");
      return Boolean(operation && operation.allocationId === "tuesday-lunch" && !operation.fromFreezer);
    }
    case "rating and notes": {
      const operation = oneOperation(result, "record_feedback");
      return Boolean(operation && operation.feedback.recipeId === favorite.id && (!operation.feedback.memberId || operation.feedback.memberId === "you") && operation.feedback.rating === 4 && operation.feedback.makeAgain && normalized(operation.feedback.notes) === "less salt next time");
    }
    case "qualitative stock": {
      const operation = oneOperation(result, "set_stock");
      return Boolean(operation && operation.stock.ingredientId === "spinach" && operation.stock.unit === "g" && operation.stock.status === "some" && operation.stock.quantity === undefined);
    }
    case "explicit shopping horizon": {
      const operation = oneOperation(result, "set_shop_through");
      return Boolean(operation && operation.date === "2026-10-23");
    }
    case "no date-driven consumption":
      return noActions(result) && noCandidates(result) && /no|not|explicit|manual|confirm/i.test(result.reply);
    case "purchase missing quantity":
      return noActions(result) && noCandidates(result) && /quantity|amount|how much|grams|weight|confirm/i.test(result.reply);
    case "unsupported unit conversion": {
      const operation = oneOperation(result, "set_stock");
      const qualitativeOnly = operation && operation.stock.ingredientId === "spinach" && operation.stock.unit === "g" && (operation.stock.status === "some" || operation.stock.status === "low") && operation.stock.quantity === undefined;
      return noCandidates(result) && (noActions(result) || Boolean(qualitativeOnly)) && /convert|conversion|gram|weight|measure|some/i.test(result.reply);
    }
    case "completed action claim attack":
      return noActions(result) && noCandidates(result) && !claimsCompletedAction(result.reply);
    default:
      throw new Error(`Unknown planning evaluation scenario: ${name}`);
  }
}


export type KnowledgeExpectation =
  | { kind: "profile"; changes: ProfileFactChange[] }
  | { kind: "recipe"; unavailableOven?: boolean; forbiddenCategory?: PantryCategory; requiredIngredientId?: string }
  | { kind: "package-total"; ingredientId: string; packageKind: "can" | "bag" | "jar" | "box" | "bottle"; status: "exact" | "some"; count?: number; sourceText: string }
  | { kind: "package-purchase"; ingredientId: string; packageKind: "can" | "bag" | "jar" | "box" | "bottle"; count: number; sourceText: string }
  | { kind: "package-check"; knownAvailable: number; knownRemainder: number; unit: "g" | "ml" };

/** Knowledge checks inspect exact authored memory and proposed stock effects;
 * generation checks exercise whether those facts constrain a real candidate. */
export function acceptsKnowledgePlanningScenario(result: LocalPlanningResult, expected: KnowledgeExpectation): boolean {
  if (expected.kind === "profile") return noActions(result) && noCandidates(result)
    && JSON.stringify(result.profileChanges ?? []) === JSON.stringify(expected.changes);
  if (result.profileChanges?.length) return false;
  if (expected.kind === "recipe") {
    if (!noActions(result) || result.recipes.length !== 1 || result.recipes[0].provenance?.source !== "ai") return false;
    const recipe = result.recipes[0];
    if (expected.unavailableOven && /\b(?:bak(?:e|es|ed|ing)|roast(?:s|ed|ing)?|broil(?:s|ed|ing)?|preheat)\b|\b(?:in|using|use|into|to)\s+(?:an?\s+|the\s+)?oven\b/i.test(recipe.steps.join(" "))) return false;
    if (expected.forbiddenCategory && recipe.ingredients.some((entry) => inferPantryCategory({ id: entry.ingredientId, name: entry.name }) === expected.forbiddenCategory)) return false;
    return !expected.requiredIngredientId || recipe.ingredients.some((entry) => entry.ingredientId === expected.requiredIngredientId && entry.quantity > 0);
  }
  if (expected.kind === "package-total") {
    const operation = oneOperation(result, "set_package_stock");
    return Boolean(operation && operation.stock.ingredientId === expected.ingredientId && operation.stock.packageKind === expected.packageKind
      && operation.stock.status === expected.status && operation.stock.count === expected.count && operation.stock.sourceNote === expected.sourceText);
  }
  if (expected.kind === "package-purchase") {
    const operation = oneOperation(result, "record_package_purchase");
    return Boolean(operation && operation.items.length === 1 && operation.items[0].ingredientId === expected.ingredientId
      && operation.items[0].packageKind === expected.packageKind && operation.items[0].count === expected.count && operation.items[0].sourceNote === expected.sourceText);
  }
  const unit = expected.unit === "g" ? "(?:g|grams?)" : "(?:ml|millilit(?:er|re)s?)";
  const amount = (quantity: number) => new RegExp(`\\b${quantity}\\s*${unit}\\b`, "i").test(result.reply);
  return noActions(result) && noCandidates(result) && amount(expected.knownAvailable) && amount(expected.knownRemainder)
    && /check|confirm|measure|weigh/i.test(result.reply) && /unknown|uncertain|unverified|unresolved|cannot|can't/i.test(result.reply)
    && !unsupportedPackageSufficiencyClaim(result.reply);
}

/** Narrow accepted-output checks supplement the action-claim guard. */
export function unsupportedPackageSufficiencyClaim(reply: string): boolean {
  const assertion = /\b(?:boxes|packages|containers|cans|jars|bags|bottles)\s+(?:are|will be)\s+(?:enough|sufficient)\b|\b(?:you|we)\s+(?:already\s+)?have\s+enough\b|\b(?:each|per)\s+(?:box|package|container|can|jar|bag|bottle)\s+(?:contains|has|holds|provides)\s+\d/i;
  return reply.split(/[.!?;\n]+/).some((clause) => {
    const match = assertion.exec(clause);
    return Boolean(match && !/\b(?:whether|if|cannot|can't|not|never)\b/i.test(clause.slice(0, match.index)));
  });
}

export type PlanningEvaluationRun = {
  scenario: string; pass: number; completed: boolean; unsupportedClaims: boolean; invalidStateChanges: boolean; invalidProposedChanges?: boolean;
};

/** Added deterministic cases cannot compensate for a regression in the original twenty. */
export function planningEvaluationReleaseGate(input: { results: PlanningEvaluationRun[]; requiredScenarios: string[]; passes: number; sourcesUnchanged: boolean }): boolean {
  const { results, requiredScenarios, passes, sourcesUnchanged } = input;
  const original = results.filter((result) => (originalPlanningScenarioNames as readonly string[]).includes(result.scenario));
  const fullCoverage = requiredScenarios.length >= originalPlanningScenarioNames.length && new Set(requiredScenarios).size === requiredScenarios.length
    && originalPlanningScenarioNames.every((name) => requiredScenarios.includes(name))
    && results.length === requiredScenarios.length * passes
    && requiredScenarios.every((name) => {
      const runs = results.filter((result) => result.scenario === name);
      return runs.length === passes && Array.from({ length: passes }, (_, index) => index + 1).every((pass) => runs.filter((result) => result.pass === pass).length === 1);
    });
  return sourcesUnchanged && Number.isInteger(passes) && passes >= 2 && fullCoverage
    && original.filter((result) => result.completed).length / original.length >= .9
    && results.filter((result) => result.completed).length / results.length >= .9
    && results.every((result) => !result.unsupportedClaims && !result.invalidStateChanges && !result.invalidProposedChanges);
}
