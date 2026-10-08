import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, householdActionSchema, type HouseholdState, type PilotChange, type PilotOperation, type Recipe } from "@/lib/contracts";
import { applyPilotCommand, buildPilotShoppingList, ensurePilot, getMealCoverage, PilotCommandError } from "./pilot";

const recipe: Recipe = {
  id: "pasta", name: "Vegetable pasta", description: "A household favorite", servings: 2, minutes: 20,
  ingredients: [{ ingredientId: "pasta", name: "Pasta", unit: "g", quantity: 200 }],
  steps: ["Cook the pasta."], provenance: { source: "import", method: "text", title: "Family recipe" },
};
const makeState = (quantity = 0) => ensurePilot(householdStateSchema.parse({
  version: 1,
  pantry: [{ id: "pasta", name: "Pasta", unit: "g", quantity, location: "Cupboard", useSoon: false }],
  preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true }, meals: [],
}), "2026-10-12");
let sequence = 0;
function run(state: HouseholdState, operation: PilotOperation, id = `command-${sequence++}`) {
  return applyPilotCommand(state, { id, expectedRevision: state.pilot?.revision ?? 0, operation }, { now: "2026-10-12T12:00:00.000Z" });
}
function batch(id = "batch", portions = 6, reservedExtra = 0): PilotOperation {
  return {
    type: "create_batch", batch: { id, recipe, prepareDate: "2026-10-12", yield: portions, reservedExtra },
    allocations: [],
  };
}
function allocation(id: string, date: string, memberId = "you", batchId = "batch", portions = 1): PilotOperation {
  return { type: "allocate", allocation: { id, batchId, memberId, date, slot: "lunch", portions } };
}
function rejectsCode(fn: () => unknown, code: PilotCommandError["code"]) {
  assert.throws(fn, (error) => error instanceof PilotCommandError && error.code === code);
}

test("migration preserves legacy kitchen, preferences, provenance, drafts and conversations without merging recipe names", () => {
  const original = householdStateSchema.parse({
    ...makeState(), pilot: undefined,
    meals: [
      { id: "one", recipe, servings: 2, date: "2026-10-12", slot: "lunch" },
      { id: "two", recipe, servings: 4, date: "2026-10-13", slot: "dinner" },
      { id: "undated", recipe, servings: 2 },
    ],
    workspace: { calendar: { draft: [{ id: "draft", recipe, servings: 2 }] }, chatMessages: [{ id: "message", role: "user", text: "Keep pasta", servings: 2 }] },
  });
  const migrated = ensurePilot(original, "2026-10-12");
  assert.deepEqual(migrated.pantry, original.pantry);
  assert.deepEqual(migrated.preferences, original.preferences);
  assert.deepEqual(migrated.meals, original.meals);
  assert.deepEqual(migrated.workspace, original.workspace);
  assert.equal(migrated.pilot.batches.length, 2);
  assert.equal(migrated.pilot.allocations.length, 4);
  assert.equal(migrated.pilot.batches[0].recipe.provenance?.title, "Family recipe");
  assert.deepEqual(migrated.pilot.proposals[0].legacyMeals, original.workspace.calendar.draft);
  assert.equal(migrated.pilot.unplacedMeals[0].id, "undated");
  assert.deepEqual(migrated.pilot.session.messages, original.workspace.chatMessages);
  assert.deepEqual(ensurePilot(migrated, "2028-01-01"), migrated);
});

test("a work lunch covers only one person", () => {
  const state = run(makeState(), { type: "set_coverage", coverage: { id: "work", memberId: "you", date: "2026-10-13", slot: "lunch", reason: "work" } }).state;
  const coverage = getMealCoverage(state, "2026-10-13", "lunch");
  assert.equal(coverage[0].coverage?.reason, "work");
  assert.equal(coverage[1].coverage, undefined);
  assert.deepEqual(state.pantry, makeState().pantry);
});

test("one six-portion batch spanning three occasions counts ingredients once, combines batches and subtracts stock once", () => {
  let state = run(makeState(250), batch()).state;
  for (let day = 12; day <= 14; day++) {
    for (const person of ["you", "partner"]) state = run(state, allocation(`${day}-${person}`, `2026-10-${day}`, person)).state;
  }
  const shopping = buildPilotShoppingList(state);
  assert.equal(shopping.shortages[0].required, 600);
  assert.equal(shopping.shortages[0].quantity, 350);
  state = run(state, batch("second", 2)).state;
  assert.equal(buildPilotShoppingList(state).shortages[0].quantity, 550);
  assert.equal(state.pantry[0].quantity, 250);
});

test("allocations cannot precede preparation, overbook portions, or collide per person", () => {
  let state = run(makeState(), batch("batch", 2)).state;
  rejectsCode(() => run(state, allocation("early", "2026-10-11")), "invalid");
  rejectsCode(() => run(state, allocation("too-many", "2026-10-12", "you", "batch", 3)), "invalid");
  state = run(state, allocation("first", "2026-10-12")).state;
  rejectsCode(() => run(state, allocation("collision", "2026-10-12")), "invalid");
  rejectsCode(() => run(state, allocation("unknown", "2026-10-13", "stranger")), "invalid");
  assert.equal(state.pilot.allocations.length, 1);
});

test("removing an uncooked allocation shrinks yield while preserving reserved extras", () => {
  let state = run(makeState(), batch("batch", 6, 2)).state;
  state = run(state, allocation("one", "2026-10-12", "you", "batch", 2)).state;
  state = run(state, allocation("two", "2026-10-13", "you", "batch", 2)).state;
  state = run(state, { type: "remove_allocation", allocationId: "one" }).state;
  assert.equal(state.pilot.batches[0].yield, 4);
  assert.equal(state.pilot.batches[0].reservedExtra, 2);
  assert.equal(buildPilotShoppingList(state).shortages[0].required, 400);
});

test("eating out removes only that person's allocation and keeps purchased inventory", () => {
  let state = run(makeState(), batch("batch", 2)).state;
  state = run(state, allocation("you", "2026-10-12")).state;
  state = run(state, allocation("partner", "2026-10-12", "partner")).state;
  state = run(state, { type: "record_purchase", items: [{ ingredientId: "pasta", name: "Pasta", quantity: 500, unit: "g" }] }).state;
  state = run(state, { type: "set_coverage", coverage: { id: "out", memberId: "you", date: "2026-10-12", slot: "lunch", reason: "eating-out" } }).state;
  assert.equal(state.pilot.allocations.length, 1);
  assert.equal(state.pilot.allocations[0].memberId, "partner");
  assert.equal(state.pilot.batches[0].yield, 1);
  assert.equal(state.pantry[0].quantity, 500);
});

test("shopping horizon follows preparation, includes freezer batches, and ignores calendar browsing", () => {
  let state = run(makeState(), batch("freezer", 6, 6)).state;
  state = run(state, { ...batch("later", 2), batch: { id: "later", recipe, prepareDate: "2026-10-25", yield: 2, reservedExtra: 2 } } as PilotOperation).state;
  assert.equal(buildPilotShoppingList(state).shortages[0].required, 600);
  const priorHorizon = state.pilot.shopThrough;
  state = run(state, { type: "set_session", session: { ...state.pilot.session, startDate: "2026-11-01", days: 14 } }).state;
  assert.equal(state.pilot.shopThrough, priorHorizon);
  assert.equal(buildPilotShoppingList(state).shortages[0].required, 600);
  state = run(state, { type: "set_shop_through", date: "2026-10-25" }).state;
  assert.equal(buildPilotShoppingList(state).shortages[0].required, 800);
});

test("qualitative stock produces a check and enough-for-this never fabricates a balance", () => {
  let state = run(makeState(900), batch()).state;
  state = run(state, { type: "set_stock", stock: { ingredientId: "pasta", name: "Pasta", unit: "g", status: "some" } }).state;
  const list = buildPilotShoppingList(state);
  assert.equal(list.shortages.length, 0);
  assert.equal(list.checks[0].required, 600);
  assert.equal(list.checks[0].resolved, false);
  state = run(state, { type: "confirm_stock", ingredientId: "pasta", unit: "g", fingerprint: list.checks[0].fingerprint }).state;
  assert.equal(buildPilotShoppingList(state).checks[0].resolved, true);
  assert.equal(state.pilot.stock[0].quantity, undefined);
  assert.equal(state.pantry[0].quantity, 900);
  state = run(state, batch("extra", 2)).state;
  assert.equal(buildPilotShoppingList(state).checks[0].resolved, false);
  rejectsCode(() => run(state, { type: "confirm_stock", ingredientId: "pasta", unit: "g", fingerprint: list.checks[0].fingerprint }), "conflict");
});

test("uncertain quantities are rejected, out stock creates a shortage, and canonical IDs plus units stay distinct", () => {
  let state = run(makeState(900), batch()).state;
  rejectsCode(() => run(state, { type: "set_stock", stock: { ingredientId: "pasta", name: "Pasta", unit: "g", status: "some", quantity: 10 } }), "invalid");
  state = run(state, { type: "set_stock", stock: { ingredientId: "pasta", name: "Pasta", unit: "ml", status: "out" } }).state;
  assert.equal(buildPilotShoppingList(state).shortages.length, 0);
  state = run(state, { type: "set_stock", stock: { ingredientId: "pasta", name: "Pasta", unit: "g", status: "out" } }).state;
  assert.equal(buildPilotShoppingList(state).shortages[0].quantity, 600);
  state = run(state, { type: "record_purchase", items: [{ ingredientId: "pasta", name: "Pasta", unit: "g", quantity: 700 }] }).state;
  assert.equal(buildPilotShoppingList(state).shortages.length, 0);
  assert.equal(state.pantry.find((entry) => entry.unit === "g")?.quantity, 700);
});

test("purchases and cooking are retry-safe even with obsolete expected revisions", () => {
  let state = run(makeState(), batch()).state;
  const purchase = { id: "purchase-once", expectedRevision: state.pilot.revision, operation: { type: "record_purchase", items: [{ ingredientId: "pasta", name: "Pasta", unit: "g", quantity: 1000 }] } };
  state = applyPilotCommand(state, purchase).state;
  const repeatedPurchase = applyPilotCommand(state, purchase);
  assert.equal(repeatedPurchase.duplicate, true);
  assert.equal(repeatedPurchase.state.pantry[0].quantity, 1000);
  const cook = { id: "cook-once", expectedRevision: state.pilot.revision, operation: { type: "cook_batch", batchId: "batch", actualPortions: 6, freezerPortions: 2 } };
  state = applyPilotCommand(state, cook).state;
  const repeatedCook = applyPilotCommand(state, cook);
  assert.equal(repeatedCook.duplicate, true);
  assert.equal(repeatedCook.state.pantry[0].quantity, 400);
  assert.equal(repeatedCook.state.pilot.prepared.length, 1);
  assert.equal(state.pilot.prepared[0].ingredientUses[0].quantity, 600);
  rejectsCode(() => applyPilotCommand(state, { ...purchase, operation: { ...purchase.operation, items: [{ ingredientId: "pasta", name: "Pasta", unit: "g", quantity: 2000 }] } }), "conflict");
});

test("cooking shortages fail atomically and actual portions must cover existing allocations", () => {
  let state = run(makeState(500), batch()).state;
  state = run(state, allocation("meal", "2026-10-12", "you", "batch", 3)).state;
  const original = structuredClone(state);
  rejectsCode(() => run(state, { type: "cook_batch", batchId: "batch", actualPortions: 6, freezerPortions: 2 }), "invalid");
  assert.deepEqual(state, original);
  state = run(state, { type: "record_purchase", items: [{ ingredientId: "pasta", name: "Pasta", unit: "g", quantity: 100 }] }).state;
  rejectsCode(() => run(state, { type: "cook_batch", batchId: "batch", actualPortions: 2, freezerPortions: 0 }), "invalid");
});

test("prepared food remains after calendar changes and freezer consumption reduces physical balance explicitly", () => {
  let state = run(makeState(1000), batch()).state;
  state = run(state, allocation("first", "2026-10-12", "you", "batch", 2)).state;
  state = run(state, { type: "cook_batch", batchId: "batch", actualPortions: 6, freezerPortions: 2 }).state;
  state = run(state, { type: "remove_allocation", allocationId: "first" }).state;
  assert.equal(state.pilot.prepared[0].produced, 6);
  assert.equal(buildPilotShoppingList(state).batches.length, 0);
  state = run(state, allocation("later", "2026-10-25", "you", "batch", 2)).state;
  state = run(state, { type: "consume", allocationId: "later", fromFreezer: true }).state;
  assert.equal(state.pilot.prepared[0].consumed, 2);
  assert.equal(state.pilot.prepared[0].freezerPortions, 0);
  assert.equal(state.pilot.allocations[0].consumedAt, "2026-10-12T12:00:00.000Z");
  rejectsCode(() => run(state, { type: "consume", allocationId: "later" }), "invalid");
  rejectsCode(() => run(state, { type: "remove_batch", batchId: "batch" }), "invalid");
  rejectsCode(() => run(state, allocation("overbook", "2026-10-26", "you", "batch", 5)), "invalid");
});

test("proposals are review-only, preserve validity across conversation changes, and reject stale application", () => {
  let state = makeState();
  const change = { type: "set_coverage" as const, coverage: { id: "work", memberId: "you", date: "2026-10-13", slot: "lunch" as const, reason: "work" as const } };
  state = run(state, { type: "propose", id: "proposal", title: "Cover Tuesday", changes: [change] }).state;
  assert.equal(state.pilot.coverage.length, 0);
  state = run(state, { type: "set_session", session: { ...state.pilot.session, draft: "Maybe Wednesday too" } }).state;
  assert.equal(state.pilot.proposals[0].status, "pending");
  const applied = run(state, { type: "apply_proposal", proposalId: "proposal" }).state;
  assert.equal(applied.pilot.coverage.length, 1);
  assert.equal(applied.pilot.proposals[0].status, "applied");
  state = run(state, { type: "set_shop_through", date: "2026-10-20" }).state;
  rejectsCode(() => run(state, { type: "apply_proposal", proposalId: "proposal" }), "stale-proposal");
  assert.equal(state.pilot.coverage.length, 0);
});

test("selected proposal placements retain one correctly sized batch and groceries, and undo restores the complete review", () => {
  const changes: PilotChange[] = [{ type: "create_batch", batch: { id: "batch", recipe, prepareDate: "2026-10-12", yield: 6, reservedExtra: 2 },
    allocations: ["you", "partner"].flatMap((memberId) => [12, 13].map((day) => ({ id: `${memberId}-${day}`, memberId, batchId: "batch", date: `2026-10-${day}`, slot: "lunch" as const, portions: 1 }))) },
  { type: "create_batch", batch: { id: "omit", recipe, prepareDate: "2026-10-14", yield: 1, reservedExtra: 0 }, allocations: [{ id: "omit-meal", memberId: "you", batchId: "omit", date: "2026-10-14", slot: "lunch", portions: 1 }] },
  { type: "record_purchase", items: [{ ingredientId: "pasta", name: "Pasta", unit: "g", quantity: 900 }] }];
  const proposed = run(makeState(100), { type: "propose", id: "select", title: "Review the week", changes }).state;
  const operation: PilotOperation = { type: "apply_proposal", proposalId: "select", selectedAllocationIds: ["you-12", "partner-12"], includeOtherChanges: false };
  const applied = run(proposed, operation, "selected-once");
  assert.equal(applied.state.pilot.batches.length, 1);
  assert.equal(applied.state.pilot.batches[0].yield, 4);
  assert.equal(applied.state.pilot.batches[0].reservedExtra, 2);
  assert.deepEqual(applied.state.pilot.allocations.map((entry) => entry.id), ["you-12", "partner-12"]);
  assert.equal(buildPilotShoppingList(applied.state).shortages[0].quantity, 300);
  assert.equal(applied.state.pantry[0].quantity, 100, "other effects require explicit selection");
  assert.deepEqual(applied.state.pilot.proposals[0].changes, changes, "the original review is retained");
  assert.equal(run(applied.state, operation, "selected-once").duplicate, true);
  const undone = run(applied.state, { type: "undo", receiptId: applied.receipt.id }).state;
  assert.equal(undone.pilot.batches.length, 0);
  assert.equal(undone.pilot.proposals[0].status, "pending");
  assert.deepEqual(undone.pilot.proposals[0].changes, changes);
});

test("selecting prepared portions preserves physical stock and requires opt-in for separate changes", () => {
  let state = run(makeState(1000), batch("cooked", 6, 2)).state;
  state = run(state, { type: "cook_batch", batchId: "cooked", actualPortions: 6, freezerPortions: 2 }).state;
  const changes: PilotChange[] = [
    { type: "allocate", allocation: { id: "first", batchId: "cooked", memberId: "you", date: "2026-10-13", slot: "lunch", portions: 1 } },
    { type: "allocate", allocation: { id: "second", batchId: "cooked", memberId: "partner", date: "2026-10-13", slot: "lunch", portions: 1 } },
    { type: "set_shop_through", date: "2026-10-25" },
  ];
  state = run(state, { type: "propose", id: "prepared", title: "Plan prepared food", changes }).state;
  const partial = run(state, { type: "apply_proposal", proposalId: "prepared", selectedAllocationIds: ["second"], includeOtherChanges: false }).state;
  assert.deepEqual(partial.pilot.allocations.map((entry) => entry.id), ["second"]);
  assert.deepEqual(partial.pilot.prepared, state.pilot.prepared);
  assert.deepEqual(partial.pantry, state.pantry);
  assert.equal(partial.pilot.shopThrough, state.pilot.shopThrough);
  const otherOnly = run(state, { type: "apply_proposal", proposalId: "prepared", selectedAllocationIds: [], includeOtherChanges: true }).state;
  assert.equal(otherOnly.pilot.allocations.length, 0);
  assert.equal(otherOnly.pilot.shopThrough, "2026-10-25");
});

test("partial proposal review rejects unknown, duplicate, implicit and dependent selections atomically", () => {
  const changes: PilotChange[] = [
    { type: "set_coverage", coverage: { id: "covered", memberId: "you", date: "2026-10-13", slot: "lunch", reason: "work" } },
    { type: "clear_coverage", coverageId: "covered" },
    { type: "create_batch", batch: { id: "batch", recipe, prepareDate: "2026-10-12", yield: 1, reservedExtra: 0 }, allocations: [] },
    { type: "allocate", allocation: { id: "dependent", batchId: "batch", memberId: "you", date: "2026-10-13", slot: "lunch", portions: 1 } },
  ];
  const state = run(makeState(), { type: "propose", id: "review", title: "Review dependencies", changes }).state;
  const original = structuredClone(state);
  for (const selectedAllocationIds of [["unknown"], ["dependent", "dependent"], ["dependent"], []]) {
    rejectsCode(() => run(state, { type: "apply_proposal", proposalId: "review", selectedAllocationIds, includeOtherChanges: false }), "invalid");
  }
  rejectsCode(() => run(state, { type: "apply_proposal", proposalId: "review", selectedAllocationIds: ["dependent"] }), "invalid");
  rejectsCode(() => run(state, { type: "apply_proposal", proposalId: "review", includeOtherChanges: true }), "invalid");
  assert.deepEqual(state, original);
});

test("changing a referenced candidate invalidates its proposal while conversation and focus edits preserve it", () => {
  let state = makeState();
  state = run(state, { type: "set_session", session: { ...state.pilot.session, candidates: [recipe], focusedRecipeId: recipe.id } }).state;
  state = run(state, { type: "propose", id: "candidate", title: "Original recipe", changes: [{ type: "create_batch", batch: { id: "batch", recipe, prepareDate: "2026-10-12", yield: 1, reservedExtra: 0 }, allocations: [{ id: "meal", batchId: "batch", memberId: "you", date: "2026-10-13", slot: "lunch", portions: 1 }] }] }).state;
  state = run(state, { type: "set_session", session: { ...state.pilot.session, draft: "Thinking", focusedRecipeId: null } }).state;
  assert.equal(state.pilot.proposals[0].status, "pending");
  for (const candidates of [[], [{ ...recipe, minutes: 10, steps: ["Use the quicker preparation."] }]]) {
    const changed = run(state, { type: "set_session", session: { ...state.pilot.session, candidates } }).state;
    assert.equal(changed.pilot.proposals[0].status, "stale");
    rejectsCode(() => run(changed, { type: "apply_proposal", proposalId: "candidate", selectedAllocationIds: ["meal"], includeOtherChanges: false }), "stale-proposal");
    assert.equal(changed.pilot.batches.length, 0);
    const applied = run(state, { type: "apply_proposal", proposalId: "candidate", selectedAllocationIds: ["meal"], includeOtherChanges: false });
    const revised = run(applied.state, { type: "set_session", session: { ...applied.state.pilot.session, candidates } }).state;
    const undone = run(revised, { type: "undo", receiptId: applied.receipt.id }).state;
    assert.equal(undone.pilot.proposals[0].status, "stale", "undo cannot revive a proposal for an older candidate");
  }
  const rejected = run(state, { type: "set_session", session: { ...state.pilot.session, rejectedRecipeIds: [recipe.id] } }).state;
  assert.equal(rejected.pilot.proposals[0].status, "stale", "rejecting a candidate invalidates its pending placements");
});

test("material planning requirements stale proposals while calendar browsing preserves dated placements", () => {
  let state = run(makeState(), { type: "propose", id: "scope", title: "Tuesday coverage", changes: [{ type: "set_coverage", coverage: { id: "work", memberId: "you", date: "2026-10-13", slot: "lunch", reason: "work" } }] }).state;
  state = run(state, { type: "set_session", session: { ...state.pilot.session, startDate: "2026-10-19", days: 14, focusDate: "2026-10-20", focusSlot: "dinner", draft: "A thought" } }).state;
  assert.equal(state.pilot.proposals[0].status, "pending");
  for (const patch of [{ constraints: "Only meals under 10 minutes" }, { equipment: ["No oven available"] }, { memberIds: ["partner"] }]) {
    const changed = run(state, { type: "set_session", session: { ...state.pilot.session, ...patch } }).state;
    assert.equal(changed.pilot.proposals[0].status, "stale");
    rejectsCode(() => run(changed, { type: "apply_proposal", proposalId: "scope" }), "stale-proposal");
    assert.equal(changed.pilot.coverage.length, 0);
  }
});

test("undo preserves conversation and idempotency history while refusing intervening meaningful edits", () => {
  const first = run(makeState(), batch());
  let state = first.state;
  state = run(state, { type: "set_session", session: { ...state.pilot.session, draft: "Keep this thought" } }).state;
  state = run(state, { type: "undo", receiptId: first.receipt.id }).state;
  assert.equal(state.pilot.batches.length, 0);
  assert.equal(state.pilot.session.draft, "Keep this thought");
  assert.equal(state.pilot.receipts[0].undoneBy, state.pilot.receipts.at(-1)?.id);
  const replay = applyPilotCommand(state, { id: first.receipt.commandId, expectedRevision: 0, operation: batch() });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.state.pilot.batches.length, 0);
  const second = run(state, batch("second"));
  state = run(second.state, { type: "set_shop_through", date: "2026-10-30" }).state;
  rejectsCode(() => run(state, { type: "undo", receiptId: second.receipt.id }), "conflict");
});

test("concurrent commands conflict, feedback persists without rearranging plans, and server rejects snapshot replacement", () => {
  let state = run(makeState(), batch()).state;
  const before = structuredClone(state.pilot.batches);
  state = run(state, { type: "record_feedback", feedback: { id: "rating", recipeId: recipe.id, rating: 4, makeAgain: true, notes: "Less salt next time" } }).state;
  assert.deepEqual(state.pilot.batches, before);
  assert.equal(state.pilot.feedback[0].notes, "Less salt next time");
  rejectsCode(() => applyPilotCommand(state, { id: "concurrent", expectedRevision: 0, operation: { type: "set_shop_through", date: "2026-10-30" } }), "conflict");
  assert.equal(householdActionSchema.safeParse({ type: "replace", state }).success, false);
  assert.equal(householdActionSchema.safeParse({ type: "setCalendarDraft", meals: [] }).success, true);
});

test("assistant session and reviewable proposal are accepted atomically", () => {
  const state = makeState();
  const original = structuredClone(state);
  const session = { ...state.pilot.session, draft: "", messages: [{ id: "ai", role: "assistant" as const, text: "Review these meals.", recipes: [], servings: 2 }] };
  const invalid = { type: "allocate" as const, allocation: { id: "missing", batchId: "unknown", memberId: "you", date: "2026-10-13", slot: "lunch" as const, portions: 1 } };
  rejectsCode(() => run(state, { type: "receive_planning_result", baseRevision: state.pilot.revision, session, proposal: { id: "bad", title: "Invalid proposal", changes: [invalid] } }), "invalid");
  assert.deepEqual(state, original);
  const valid = { type: "set_coverage" as const, coverage: { id: "work", memberId: "you", date: "2026-10-13", slot: "lunch" as const, reason: "work" as const } };
  const result = run(state, { type: "receive_planning_result", baseRevision: state.pilot.revision, session, proposal: { id: "good", title: "Tuesday work lunch", changes: [valid] } });
  assert.equal(result.state.pilot.revision, 1);
  assert.equal(result.state.pilot.session.messages[0].id, "ai");
  assert.equal(result.state.pilot.proposals[0].baseRevision, 1);
  assert.equal(result.state.pilot.coverage.length, 0);
});


test("assistant results cannot be rebased onto newer household revisions", () => {
  const original = makeState();
  const changed = run(original, { type: "set_shop_through", date: "2026-10-23" }).state;
  rejectsCode(() => run(changed, { type: "receive_planning_result", baseRevision: original.pilot.revision, session: original.pilot.session }), "conflict");
  assert.equal(changed.pilot.shopThrough, "2026-10-23");
});

test("dismissing proposals keeps other current proposals valid and undo recovers legacy drafts", () => {
  const original = makeState();
  original.pilot.proposals.push({ id: "legacy", title: "Recovered", baseRevision: 0, changes: [], legacyMeals: [{ id: "old", recipe, servings: 2 }], status: "pending" });
  original.pilot.proposals.push({ id: "current", title: "Current", baseRevision: 0, changes: [{ type: "set_shop_through", date: "2026-10-23" }], status: "pending" });
  const result = run(original, { type: "dismiss_proposal", proposalId: "legacy" });
  assert.equal(result.state.pilot.proposals.length, 1);
  assert.equal(result.state.pilot.proposals[0].status, "pending");
  assert.equal(result.state.pilot.proposals[0].baseRevision, 1);
  const restored = run(result.state, { type: "undo", receiptId: result.receipt.id }).state;
  assert.deepEqual(restored.pilot.proposals.find((p) => p.id === "legacy")?.legacyMeals, original.pilot.proposals[0].legacyMeals);
  assert.ok(restored.pilot.proposals.every((proposal) => proposal.status === "pending" && proposal.baseRevision === restored.pilot.revision));
  assert.deepEqual(restored.pilot.batches, original.pilot.batches);
});
