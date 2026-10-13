import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, type HouseholdState, type Recipe } from "@/lib/contracts";
import { applyPilotCommand, buildPilotShoppingList, ensurePilot } from "./pilot";
import { buildServingPlan, type ServingPlanDraft } from "./serving-plan";

const recipe: Recipe = {
  id: "pasta", name: "Vegetable pasta", description: "One cooking batch", servings: 2, minutes: 20,
  ingredients: [{ ingredientId: "pasta", name: "Pasta", unit: "g", quantity: 200 }], steps: ["Cook the pasta."],
};
const makeState = () => ensurePilot(householdStateSchema.parse({
  version: 1, pantry: [{ id: "pasta", name: "Pasta", unit: "g", quantity: 250, location: "Cupboard", useSoon: false }],
  preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true }, meals: [],
}), "2026-10-12");
const draft = (): ServingPlanDraft => ({
  prepareDate: "2026-10-12", totalPortions: 6,
  allocations: [12, 13, 14].map((day) => ({ id: `meal-${day}`, memberId: "you", date: `2026-10-${day}`, slot: "dinner", portions: 2 })),
});
function save(state: HouseholdState, input: ServingPlanDraft) {
  const result = buildServingPlan(state, recipe, input, "batch");
  if (!result.ok) throw new Error(result.errors.join(" "));
  return applyPilotCommand(state, { id: "plan", expectedRevision: state.pilot?.revision ?? 0, operation: result.operation }, { now: "2026-10-12T12:00:00.000Z" }).state;
}

test("six portions distributed across three meals remain one yield and one ingredient demand", () => {
  const original = makeState();
  const distributed = save(original, draft());
  const reserved = save(original, { ...draft(), allocations: [] });
  assert.equal(distributed.pilot?.batches.length, 1);
  assert.equal(distributed.pilot?.batches[0].yield, 6);
  assert.equal(distributed.pilot?.batches[0].reservedExtra, 0);
  assert.equal(distributed.pilot?.allocations.length, 3);
  assert.equal(reserved.pilot?.batches[0].reservedExtra, 6);
  assert.deepEqual(buildPilotShoppingList(distributed).shortages, buildPilotShoppingList(reserved).shortages);
  assert.deepEqual(buildPilotShoppingList(distributed).checks, buildPilotShoppingList(reserved).checks);
  assert.equal(buildPilotShoppingList(distributed).shortages[0].required, 600);
  assert.equal(buildPilotShoppingList(distributed).shortages[0].quantity, 350);
  assert.deepEqual(distributed.pantry, original.pantry);
  assert.equal(original.pilot.batches.length, 0);
});

test("unallocated remainder is reserved without claiming cooked or frozen food", () => {
  const result = buildServingPlan(makeState(), recipe, { ...draft(), allocations: draft().allocations.slice(0, 2) }, "batch");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.allocatedPortions, 4);
  assert.equal(result.reservedPortions, 2);
  assert.equal(result.operation.batch.yield, 6);
  const saved = save(makeState(), { ...draft(), allocations: draft().allocations.slice(0, 2) });
  assert.equal(saved.pilot?.batches[0].status, "planned");
  assert.deepEqual(saved.pilot?.prepared, []);
  assert.equal(buildPilotShoppingList(saved).shortages[0].required, 600);
});

test("invalid preparation and allocation dates, unknown people, duplicate meals and over-allocation are prevented", () => {
  const valid = draft();
  const inputs: ServingPlanDraft[] = [
    { ...valid, prepareDate: "2026-02-30" },
    { ...valid, allocations: [{ ...valid.allocations[0], date: "2026-10-11" }] },
    { ...valid, allocations: [{ ...valid.allocations[0], date: "2026-13-01" }] },
    { ...valid, allocations: [{ ...valid.allocations[0], memberId: "stranger" }] },
    { ...valid, allocations: [valid.allocations[0], { ...valid.allocations[0], id: "duplicate" }] },
    { ...valid, totalPortions: 5 },
    { ...valid, totalPortions: 0 },
    { ...valid, totalPortions: 1001 },
    { ...valid, allocations: [{ ...valid.allocations[0], portions: NaN }] },
  ];
  for (const input of inputs) assert.equal(buildServingPlan(makeState(), recipe, input, "batch").ok, false);
});

test("reviewed allocations are revalidated against coverage and members in the current snapshot", () => {
  const original = makeState();
  const input = draft();
  assert.equal(buildServingPlan(original, recipe, input, "batch").ok, true);
  const covered = applyPilotCommand(original, {
    id: "work", expectedRevision: 0,
    operation: { type: "set_coverage", coverage: { id: "work-lunch", memberId: "you", date: "2026-10-12", slot: "dinner", reason: "work" } },
  }).state;
  const coveredResult = buildServingPlan(covered, recipe, input, "batch");
  assert.equal(coveredResult.ok, false);
  if (!coveredResult.ok) assert.match(coveredResult.errors.join(" "), /already covered/);
  const removedMember = { ...original, pilot: { ...original.pilot, members: original.pilot.members.filter((member) => member.id !== "you"), session: { ...original.pilot.session, memberIds: ["partner"] } } };
  const removedResult = buildServingPlan(removedMember, recipe, input, "batch");
  assert.equal(removedResult.ok, false);
  if (!removedResult.ok) assert.match(removedResult.errors.join(" "), /current household member/);
});

test("existing allocations and already saved batch IDs cannot be duplicated on retry", () => {
  const saved = save(makeState(), draft());
  assert.equal(buildServingPlan(saved, recipe, draft(), "batch").ok, false);
  const collision = buildServingPlan(saved, recipe, { ...draft(), allocations: [{ id: "fresh-meal", memberId: "you", date: "2026-10-12", slot: "dinner", portions: 1 }] }, "new-batch");
  assert.equal(collision.ok, false);
  if (!collision.ok) assert.match(collision.errors.join(" "), /already covered/);
});
