import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, type Recipe } from "@/lib/contracts";
import { ensurePilot } from "@/features/planning/pilot";
import { claimsCompletedAction, reviewLocalPlanningDraft, runLocalPlanning, groundLocalPlanningDraft, resolvePlanningDate, type LocalPlanningDraft } from "./local-planner";

const recipe: Recipe = { id: "favorite", name: "Pasta", description: "Family recipe", servings: 2, minutes: 20, ingredients: [{ ingredientId: "pasta", name: "Dry pasta", quantity: 200, unit: "g" }], steps: ["Cook pasta."], provenance: { source: "import", method: "text" } };
const state = () => ensurePilot(householdStateSchema.parse({ version: 1, pantry: [], meals: [], preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true }, workspace: { recipeBox: [{ recipe, source: "import" }] } }), "2026-10-12");
const draft = (patch: Partial<LocalPlanningDraft> = {}): LocalPlanningDraft => ({ intent: "discuss", reply: "Review this idea.", recipes: [], favoriteRecipeIds: [], coverage: [], batches: [], allocations: [], removeAllocationIds: [], purchases: [], stock: [], cooking: [], consumption: [], feedback: [], shopThrough: null, ...patch });
let index = 0;
const ids = () => `test-${index++}`;

test("local planning preserves favorite provenance without rewriting it", () => {
  const result = reviewLocalPlanningDraft(state(), draft({ intent: "favorite", favoriteRecipeIds: ["favorite"] }), ids);
  assert.deepEqual(result.recipes, [recipe]);
  assert.deepEqual(result.operations, []);
  assert.throws(() => reviewLocalPlanningDraft(state(), draft({ favoriteRecipeIds: ["invented"] }), ids));
});

test("new local recipes resolve identity independently and remain candidates", () => {
  const current = state();
  const before = structuredClone(current);
  const result = reviewLocalPlanningDraft(current, draft({ intent: "generate", recipes: [{ name: "Fresh pasta", description: "Simple", servings: 2, minutes: 15, ingredients: [{ name: "pasta", quantity: 200, unit: "g" }], steps: ["Cook pasta."] }] }), ids);
  assert.equal(result.recipes[0].ingredients[0].ingredientId, "pasta");
  assert.equal(result.recipes[0].provenance?.source, "ai");
  assert.equal(result.operations.length, 0);
  assert.deepEqual(current, before);
});

test("local batch proposals use one snapshot and domain validation before acceptance", () => {
  const current = state();
  const result = reviewLocalPlanningDraft(current, draft({ intent: "place", batches: [{ recipeRef: "favorite", prepareDate: "2026-10-12", portions: 2, reservedExtra: 0, allocations: [{ memberId: "you", date: "2026-10-13", slot: "lunch", portions: 1 }, { memberId: "partner", date: "2026-10-13", slot: "lunch", portions: 1 }] }] }), ids);
  assert.equal(result.operations[0].type, "create_batch");
  assert.equal(current.pilot.batches.length, 0);
  assert.throws(() => reviewLocalPlanningDraft(current, draft({ batches: [{ recipeRef: "favorite", prepareDate: "2026-10-14", portions: 1, reservedExtra: 0, allocations: [{ memberId: "you", date: "2026-10-13", slot: "lunch", portions: 2 }] }] }), ids));
});

test("unsupported completed action claims and fabricated uncertain quantities are rejected", () => {
  for (const text of ["I scheduled Tuesday lunch.", "I've saved your recipe.", "Your meal has been added."]) {
    assert.equal(claimsCompletedAction(text), true);
    assert.throws(() => reviewLocalPlanningDraft(state(), draft({ reply: text }), ids));
  }
  assert.equal(claimsCompletedAction("I suggest adding this to Tuesday."), false);
  assert.throws(() => reviewLocalPlanningDraft(state(), draft({ stock: [{ name: "pasta", unit: "g", status: "some", quantity: 500 }] }), ids));
});

test("one person's coverage and a purchase become reviewable shared commands", () => {
  const current = state();
  const result = reviewLocalPlanningDraft(current, draft({ coverage: [{ memberId: "you", date: "2026-10-13", slot: "lunch", reason: "work" }], purchases: [{ name: "Dry pasta", quantity: 500, unit: "g" }] }), ids);
  assert.deepEqual(result.operations.map((operation) => operation.type), ["set_coverage", "record_purchase"]);
  assert.equal(current.pantry.length, 0);
  assert.equal(current.pilot.coverage.length, 0);
});


test("cancelled local inference stops before contacting any model", async () => {
  await assert.rejects(runLocalPlanning(state(), "Find a favorite", { verify: false, signal: AbortSignal.abort() }), { name: "AbortError" });
});


test("speaker aliases map to authenticated members and weekday words use date arithmetic", () => {
  const current = state();
  current.pilot.session.startDate = "2026-10-08";
  current.pilot.session.focusDate = "2026-10-08";
  const source = draft({ intent: "coverage", coverage: [{ memberId: "requester", date: "Tuesday", slot: "lunch", reason: "work" }] });
  const grounded = groundLocalPlanningDraft(current, source, "partner");
  assert.equal(grounded.coverage[0].memberId, "partner");
  assert.equal(grounded.coverage[0].date, "2026-10-13");
  assert.equal(resolvePlanningDate("Monday", "2026-10-12"), "2026-10-12");
  assert.equal(resolvePlanningDate("next Monday", "2026-10-12"), "2026-10-19");
  assert.equal(resolvePlanningDate("Friday", "2026-12-31"), "2027-01-01");
  assert.throws(() => groundLocalPlanningDraft(current, { ...source, coverage: [{ ...source.coverage[0], memberId: "you" }] }, "partner"));
  assert.throws(() => groundLocalPlanningDraft(current, source, "outsider"));
});
