import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, type CookingBatch, type Recipe } from "@/lib/contracts";
import { buildPilotShoppingList, ensurePilot } from "./pilot";
import { previewCandidateShopping } from "./candidate-shopping";

const recipe: Recipe = { id: "pasta", name: "Pasta", description: "A candidate", servings: 2, minutes: 20, ingredients: [{ ingredientId: "pasta", name: "Dry pasta", unit: "g", quantity: 200 }], steps: ["Cook pasta."] };
const stateWith = (quantity = 0) => ensurePilot(householdStateSchema.parse({ version: 1, pantry: [{ id: "pasta", name: "Dry pasta", unit: "g", quantity, location: "Cupboard", useSoon: false }], meals: [], preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true } }), "2026-10-12");
const planned = (id: string, yieldCount: number, prepareDate = "2026-10-12", dish = recipe): CookingBatch => ({ id, recipe: dish, prepareDate, yield: yieldCount, reservedExtra: yieldCount, status: "planned" });

test("candidate yield including reserved extras scales once against stock left after existing plans", () => {
  const state = stateWith(300);
  state.pilot.batches.push(planned("existing", 2));
  const before = structuredClone(state);
  const preview = previewCandidateShopping(state, recipe, 6, "2026-10-13");
  assert.deepEqual(preview.shortages, [{ ingredientId: "pasta", name: "Dry pasta", unit: "g", quantity: 500 }]);
  assert.deepEqual(preview.checks, []);
  assert.equal(preview.extendsShoppingHorizon, false);
  assert.deepEqual(state, before, "the preview preserves pantry, horizon, allocations and receipts");
});

test("existing shortages are not charged again and unrelated requirements are omitted", () => {
  const state = stateWith(100);
  state.pilot.batches.push(planned("existing", 6));
  state.pilot.batches.push(planned("unrelated", 2, "2026-10-12", { ...recipe, id: "rice", ingredients: [{ ingredientId: "rice", name: "Rice", unit: "g", quantity: 300 }] }));
  assert.deepEqual(previewCandidateShopping(state, recipe, 2, "2026-10-13").shortages, [{ ingredientId: "pasta", name: "Dry pasta", unit: "g", quantity: 200 }]);
});

test("a later preparation compares both plans through the same temporary horizon", () => {
  const state = stateWith(200);
  state.pilot.batches.push(planned("before-candidate", 5, "2026-10-24"), planned("after-candidate", 9, "2026-10-26"));
  const before = structuredClone(state);
  const preview = previewCandidateShopping(state, recipe, 2, "2026-10-25");
  assert.equal(preview.shopThrough, "2026-10-25");
  assert.equal(preview.extendsShoppingHorizon, true);
  assert.equal(preview.shortages[0].quantity, 200, "the existing Oct24 shortage is baseline demand, not a candidate cost");
  assert.deepEqual(state, before);
});

test("uncertain candidate stock stays a combined check even after the old plan was confirmed", () => {
  const state = stateWith(999);
  const rice = { ...recipe, id: "rice", ingredients: [{ ingredientId: "rice", name: "Rice", unit: "g" as const, quantity: 100 }] };
  state.pilot.batches.push(planned("candidate-shopping-preview", 2), planned("unrelated", 2, "2026-10-12", rice));
  state.pilot.stock.push({ ingredientId: "pasta", name: "Dry pasta", unit: "g", status: "some" }, { ingredientId: "rice", name: "Rice", unit: "g", status: "low" });
  const oldCheck = buildPilotShoppingList(state).checks.find((check) => check.ingredientId === "pasta")!;
  state.pilot.stockChecks.push({ ingredientId: "pasta", unit: "g", fingerprint: oldCheck.fingerprint });
  const before = structuredClone(state);
  const preview = previewCandidateShopping(state, recipe, 4, "2026-10-13");
  assert.deepEqual(preview.shortages, [], "historical999g cannot imply known availability");
  assert.deepEqual(preview.checks, [{ ingredientId: "pasta", name: "Dry pasta", unit: "g", required: 600, candidateRequired: 400 }]);
  assert.deepEqual(state, before, "the hypothetical batch cannot reuse or overwrite a real batch identity");
});

test("package checks include a candidate covered alone when the combined plan exceeds measured stock", () => {
  const state = stateWith(500);
  state.pantry = [{ ...state.pantry[0], id: "beans", name: "Canned white beans" }];
  const candidate = { ...recipe, id: "beans", name: "Beans", ingredients: [{ ingredientId: "beans", name: "Canned white beans", unit: "g" as const, quantity: 300 }] };
  state.pilot.packageStock.push({ ingredientId: "beans", name: "Canned white beans", packageKind: "can", status: "exact", count: 10 });
  state.pilot.batches.push(planned("existing", 2, "2026-10-12", { ...candidate, ingredients: [{ ...candidate.ingredients[0], quantity: 400 }] }));
  const before = structuredClone(state);
  const preview = previewCandidateShopping(state, candidate, 2, "2026-10-13");
  assert.deepEqual(buildPilotShoppingList(state).checks, [], "the existing400g plan fits the measured500g");
  assert.deepEqual(preview.shortages, [], "unknown container contents cannot create a definite purchase amount");
  assert.deepEqual(preview.checks, [{ ingredientId: "beans", name: "Canned white beans", unit: "g", required: 700, candidateRequired: 300,
    packageAvailability: { knownAvailable: 500, knownRemainder: 200, packageStock: state.pilot.packageStock } }]);
  assert.deepEqual(state, before);
});

test("candidate package checks sum scaled duplicate contributions while keeping canonical units separate", () => {
  const state = stateWith(500);
  state.pilot.packageStock.push({ ingredientId: "pasta", name: "Dry pasta", packageKind: "bag", status: "exact", count: 2 });
  state.pilot.batches.push(planned("existing", 4));
  const duplicate = { ...recipe, servings: 4, ingredients: [
    { ingredientId: "pasta", name: "Dry pasta", unit: "g" as const, quantity: 150 },
    { ingredientId: "pasta", name: "Dry pasta", unit: "g" as const, quantity: 50 },
    { ingredientId: "pasta", name: "Pasta liquid", unit: "ml" as const, quantity: 20 },
    { ingredientId: "other-pasta", name: "Dry pasta", unit: "g" as const, quantity: 10 },
  ] };
  const before = structuredClone(state);
  const preview = previewCandidateShopping(state, duplicate, 6, "2026-10-13");
  assert.deepEqual(preview.checks.map(({ ingredientId, unit, required, candidateRequired }) => ({ ingredientId, unit, required, candidateRequired })), [
    { ingredientId: "pasta", unit: "g", required: 700, candidateRequired: 300 },
    { ingredientId: "pasta", unit: "ml", required: 30, candidateRequired: 30 },
  ]);
  assert.deepEqual(preview.shortages, [{ ingredientId: "other-pasta", name: "Dry pasta", unit: "g", quantity: 15 }]);
  assert.deepEqual(state, before);
});

test("canonical IDs and units remain distinct while duplicate ingredient rows combine", () => {
  const state = stateWith(50);
  state.pantry.push({ ...state.pantry[0], unit: "ml", quantity: 25 });
  const mixed = { ...recipe, ingredients: [
    { ingredientId: "pasta", name: "Same label", unit: "g" as const, quantity: 100 },
    { ingredientId: "pasta", name: "Same label", unit: "g" as const, quantity: 25 },
    { ingredientId: "pasta", name: "Same label", unit: "ml" as const, quantity: 50 },
    { ingredientId: "other-pasta", name: "Same label", unit: "g" as const, quantity: 100 },
  ] };
  assert.deepEqual(previewCandidateShopping(state, mixed, 2, "2026-10-13").shortages.map(({ ingredientId, unit, quantity }) => ({ ingredientId, unit, quantity })), [
    { ingredientId: "pasta", unit: "g", quantity: 75 }, { ingredientId: "pasta", unit: "ml", quantity: 25 }, { ingredientId: "other-pasta", unit: "g", quantity: 100 },
  ]);
});

test("zero proposed portions have no grocery effect and invalid yields fail closed", () => {
  const state = stateWith();
  state.pilot.batches.push(planned("existing", 6));
  state.pilot.stock.push({ ingredientId: "pasta", name: "Pasta", unit: "g", status: "low" });
  const before = structuredClone(state);
  const empty = previewCandidateShopping(state, recipe, 0, "2026-10-25");
  assert.deepEqual(empty.shortages, []); assert.deepEqual(empty.checks, []);
  for (const invalid of [-1, Infinity, NaN, 1001]) assert.throws(() => previewCandidateShopping(state, recipe, invalid, "2026-10-13"), RangeError);
  assert.deepEqual(state, before);
});
