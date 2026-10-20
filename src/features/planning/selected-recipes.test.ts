import assert from "node:assert/strict";
import test from "node:test";
import type { PilotChange, PilotOperation, Recipe } from "@/lib/contracts";
import { createSampleHousehold } from "@/features/pantry/seed";
import { ensurePilot } from "./pilot";
import { reconcileScheduledSelections, scheduledBatchesForOperation, type SelectedRecipeDrafts } from "./selected-recipes";

const recipe: Recipe = { id: "rice-bowl", name: "Rice bowl", description: "An idea", servings: 2, minutes: 20,
  ingredients: [{ ingredientId: "rice", name: "Rice", quantity: 200, unit: "g" }], steps: ["Cook rice."] };
const otherRecipe: Recipe = { ...recipe, id: "other-recipe", name: "Another meal" };
const selection = (draft = "6") => ({ shortlist: [recipe, otherRecipe], portionDrafts: { [recipe.id]: draft, [otherRecipe.id]: "2" }, stage: "groceries" as const, unrelated: "kept" });
const batchChange = (portions: number, batchId = "batch"): Extract<PilotChange, { type: "create_batch" }> => ({ type: "create_batch",
  batch: { id: batchId, recipe, prepareDate: "2026-10-20", yield: portions, reservedExtra: portions }, allocations: [] });

test("operations expose only saved batches, leaving absent schedules and unaccepted proposals alone", () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-19");
  const change = batchChange(3);
  const operation: PilotOperation = { type: "receive_planning_result", baseRevision: state.pilot.revision, session: state.pilot.session };
  assert.deepEqual(scheduledBatchesForOperation(state, change), [{ recipe, portions: 3 }]);
  assert.deepEqual(scheduledBatchesForOperation(state, { ...operation, directPlacement: { jobId: "00000000-0000-4000-8000-000000000001", request: "Schedule this", actorMemberId: "you", change } }), [{ recipe, portions: 3 }]);
  for (const noop of [operation, { ...operation, proposal: { id: "draft", title: "Review first", changes: [change] } },
    { type: "propose", id: "draft", title: "Review first", changes: [change] }, { type: "apply_proposal", proposalId: "missing" },
    { type: "set_shop_through", date: "2026-10-20" }] satisfies PilotOperation[]) assert.deepEqual(scheduledBatchesForOperation(state, noop), []);
  const captured = selection();
  assert.strictEqual(reconcileScheduledSelections(captured, structuredClone(captured), []), captured, "a failed or unscheduled operation supplies no saved candidates and cannot consume selection");
});

test("partial scheduling retains the unplanned total and preserves unrelated selection fields without mutation", () => {
  const latest = selection();
  const captured = structuredClone(latest);
  const scheduled = [{ recipe, portions: 2.5 }];
  const before = structuredClone({ latest, captured, scheduled });
  assert.deepEqual(reconcileScheduledSelections(latest, captured, scheduled), { ...latest, portionDrafts: { ...latest.portionDrafts, [recipe.id]: "3.5" } });
  assert.deepEqual({ latest, captured, scheduled }, before);
});

test("exact or greater scheduled totals remove only their matching selected snapshot", () => {
  for (const portions of [6, 8]) {
    const latest = selection();
    assert.deepEqual(reconcileScheduledSelections(latest, structuredClone(latest), [{ recipe, portions }]), { ...latest, shortlist: [otherRecipe], portionDrafts: { [otherRecipe.id]: "2" } });
  }
});

test("changed recipe snapshots, changed raw totals and invalid form values are left untouched", () => {
  const captured = selection();
  for (const latest of [
    { ...captured, shortlist: [{ ...recipe, ingredients: [{ ...recipe.ingredients[0], quantity: 300 }] }, otherRecipe] },
    { ...captured, portionDrafts: { ...captured.portionDrafts, [recipe.id]: "6.0" } },
    { ...captured, shortlist: [otherRecipe] },
  ]) assert.strictEqual(reconcileScheduledSelections(latest, captured, [{ recipe, portions: 6 }]), latest);
  for (const raw of ["", " ", "0", "-1", "0.0001", "1001", "Infinity", "not a quantity"]) {
    const latest = selection(raw);
    assert.strictEqual(reconcileScheduledSelections(latest, structuredClone(latest), [{ recipe, portions: 6 }]), latest);
  }
  const absentDraft: SelectedRecipeDrafts = { shortlist: [recipe] };
  assert.strictEqual(reconcileScheduledSelections(absentDraft, structuredClone(absentDraft), [{ recipe, portions: 6 }]), absentDraft);
  const latest = selection();
  assert.strictEqual(reconcileScheduledSelections(latest, captured, [{ recipe: { ...recipe, name: "A revised meal" }, portions: 6 }]), latest);
});

test("multiple saved batches combine only for the same recipe snapshot and handle decimal totals", () => {
  const latest = selection("1e1");
  assert.equal(reconcileScheduledSelections(latest, structuredClone(latest), [
    { recipe, portions: 2 }, { recipe: { ...recipe, name: "Different snapshot" }, portions: 100 }, { recipe, portions: 3 },
  ]).portionDrafts[recipe.id], "5");
  const decimal = selection("0.8");
  assert.deepEqual(reconcileScheduledSelections(decimal, structuredClone(decimal), [{ recipe, portions: 0.1 }, { recipe, portions: 0.7 }]).shortlist, [otherRecipe]);
  const partial = selection("0.3");
  assert.equal(reconcileScheduledSelections(partial, structuredClone(partial), [{ recipe, portions: 0.1 }]).portionDrafts[recipe.id], "0.2");
});

test("partial proposal review uses the shared selected-yield calculation before consuming selections", () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-19");
  const change = batchChange(6);
  change.batch.reservedExtra = 2;
  change.allocations = [
    { id: "first", batchId: change.batch.id, memberId: "you", date: "2026-10-20", slot: "lunch", portions: 1 },
    { id: "second", batchId: change.batch.id, memberId: "partner", date: "2026-10-20", slot: "lunch", portions: 3 },
  ];
  state.pilot.proposals.push({ id: "proposal", title: "Two lunches and extras", baseRevision: state.pilot.revision, status: "pending", changes: [change] });
  const before = structuredClone(state);
  const scheduled = scheduledBatchesForOperation(state, { type: "apply_proposal", proposalId: "proposal", selectedAllocationIds: ["first"], includeOtherChanges: true });
  assert.deepEqual(scheduled, [{ recipe, portions: 3 }]);
  const latest = selection();
  assert.equal(reconcileScheduledSelections(latest, structuredClone(latest), scheduled).portionDrafts[recipe.id], "3");
  assert.throws(() => scheduledBatchesForOperation(state, { type: "apply_proposal", proposalId: "proposal", selectedAllocationIds: ["missing"], includeOtherChanges: false }));
  assert.deepEqual(state, before);
  for (const status of ["applied", "stale"] as const) {
    state.pilot.proposals[0].status = status;
    assert.deepEqual(scheduledBatchesForOperation(state, { type: "apply_proposal", proposalId: "proposal" }), []);
  }
});
