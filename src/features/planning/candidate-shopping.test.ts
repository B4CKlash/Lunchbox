import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, type CookingBatch, type Recipe } from "@/lib/contracts";
import { buildPilotShoppingList, ensurePilot } from "./pilot";
import { previewCandidateShopping, previewUnscheduledShopping } from "./candidate-shopping";

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

test("unscheduled recipes share stock once and preserve covered ingredients for review", () => {
  const state = stateWith(400);
  state.pantry.push({ ...state.pantry[0], id: "tomatoes", name: "Tomatoes", quantity: 150 });
  const second = { ...recipe, id: "second", servings: 3, ingredients: [
    { ingredientId: "pasta", name: "Dry pasta", unit: "g" as const, quantity: 300 },
    { ingredientId: "tomatoes", name: "Tomatoes", unit: "g" as const, quantity: 100 },
  ] };
  const selection = [{ recipe, portions: 2 }, { recipe: second, portions: 3 }];
  const before = structuredClone({ state, selection });
  const preview = previewUnscheduledShopping(state, selection);
  assert.deepEqual(preview.shortages, [{ ingredientId: "pasta", name: "Dry pasta", unit: "g", quantity: 100, totalQuantity: 100 }]);
  assert.deepEqual(preview.requirements, [
    { ingredientId: "pasta", name: "Dry pasta", unit: "g", required: 500, candidateRequired: 500, existingRequired: 0, knownAvailable: 400, quantityKnown: true },
    { ingredientId: "tomatoes", name: "Tomatoes", unit: "g", required: 100, candidateRequired: 100, existingRequired: 0, knownAvailable: 150, quantityKnown: true },
  ]);
  assert.deepEqual(preview.checks, []);
  assert.deepEqual({ state, selection }, before, "previewing does not save batches, receipts, a calendar, stock deductions or a new shopping horizon");
});

test("unscheduled comparison distinguishes existing shortages within the saved horizon", () => {
  const state = stateWith(100);
  const unrelated = { ...recipe, id: "rice", ingredients: [{ ingredientId: "rice", name: "Rice", unit: "g" as const, quantity: 300 }] };
  state.pilot.batches.push(planned("existing", 6), planned("unrelated", 2, "2026-10-12", unrelated),
    planned("after-horizon", 10, "2026-10-25"), { ...planned("already-cooked", 10), status: "cooked" });
  state.pilot.prepared.push({ batchId: "already-cooked", produced: 10, consumed: 0, freezerPortions: 0, ingredientUses: [] });
  const before = structuredClone(state);
  const preview = previewUnscheduledShopping(state, [{ recipe, portions: 2 }, { recipe, portions: 2 }]);
  assert.equal(preview.shopThrough, "2026-10-18");
  assert.deepEqual(preview.shortages, [{ ingredientId: "pasta", name: "Dry pasta", unit: "g", quantity: 400, totalQuantity: 900 }]);
  assert.deepEqual(preview.requirements, [{ ingredientId: "pasta", name: "Dry pasta", unit: "g", required: 1000,
    candidateRequired: 400, existingRequired: 600, knownAvailable: 100, quantityKnown: true }]);
  assert.deepEqual(preview.checks, []);
  assert.deepEqual(state, before, "cooked and later planned food remain untouched and outside this shopping demand");
});

test("combined unscheduled amounts scale recipe base yields and keep identities and units separate", () => {
  const state = stateWith(50);
  state.pantry.push({ ...state.pantry[0], unit: "ml", quantity: 25 });
  const mixed = { ...recipe, ingredients: [
    { ingredientId: "pasta", name: "Same label", unit: "g" as const, quantity: 100 },
    { ingredientId: "pasta", name: "Same label", unit: "g" as const, quantity: 25 },
    { ingredientId: "pasta", name: "Same label", unit: "ml" as const, quantity: 50 },
    { ingredientId: "other-pasta", name: "Same label", unit: "g" as const, quantity: 100 },
  ] };
  const biggerBase = { ...recipe, id: "bigger", servings: 4, ingredients: [{ ...recipe.ingredients[0], quantity: 300 }] };
  const preview = previewUnscheduledShopping(state, [{ recipe: mixed, portions: 2 }, { recipe: biggerBase, portions: 2 }]);
  assert.deepEqual(preview.shortages.map(({ ingredientId, unit, quantity, totalQuantity }) => ({ ingredientId, unit, quantity, totalQuantity })), [
    { ingredientId: "pasta", unit: "g", quantity: 225, totalQuantity: 225 },
    { ingredientId: "pasta", unit: "ml", quantity: 25, totalQuantity: 25 },
    { ingredientId: "other-pasta", unit: "g", quantity: 100, totalQuantity: 100 },
  ]);
  assert.deepEqual(preview.requirements.map(({ candidateRequired }) => candidateRequired), [275, 50, 100]);
});

test("qualitative stock keeps combined selections uncertain after an existing sufficiency confirmation", () => {
  const state = stateWith(999);
  state.pilot.batches.push(planned("unscheduled-shopping-preview-0", 2));
  state.pilot.stock.push({ ingredientId: "pasta", name: "Dry pasta", unit: "g", status: "some" });
  const oldCheck = buildPilotShoppingList(state).checks[0];
  state.pilot.stockChecks.push({ ingredientId: "pasta", unit: "g", fingerprint: oldCheck.fingerprint });
  assert.equal(buildPilotShoppingList(state).checks[0].resolved, true);
  const before = structuredClone(state);
  const preview = previewUnscheduledShopping(state, [{ recipe, portions: 2 }, { recipe, portions: 4 }]);
  assert.deepEqual(preview.shortages, [], "a previous measured balance cannot become a known shortage or coverage");
  assert.equal(preview.requirements[0].quantityKnown, false);
  assert.deepEqual(preview.checks, [{ ingredientId: "pasta", name: "Dry pasta", unit: "g", required: 800, candidateRequired: 600,
    existingRequired: 200, knownAvailable: 0, knownRemainder: 800, packageStock: [] }]);
  assert.deepEqual(state, before, "preview identities never collide with or change a real batch");
});

test("combined recipes expose package contents to check rather than guessing measured quantities", () => {
  const state = stateWith(500);
  state.pilot.batches.push(planned("existing", 4));
  state.pilot.packageStock.push({ ingredientId: "pasta", name: "Dry pasta", packageKind: "bag", status: "exact", count: 2 });
  const first = previewUnscheduledShopping(state, [{ recipe, portions: 1 }]);
  assert.deepEqual(first.shortages, []);
  assert.deepEqual(first.checks, [], "one recipe fits the measured stock remaining after existing commitments");
  const combined = previewUnscheduledShopping(state, [{ recipe, portions: 1 }, { recipe, portions: 2 }]);
  assert.deepEqual(combined.shortages, [], "unknown contents of two bags are not two grams or two recipe portions");
  assert.deepEqual(combined.checks, [{ ingredientId: "pasta", name: "Dry pasta", unit: "g", required: 700, candidateRequired: 300,
    existingRequired: 400, knownAvailable: 500, knownRemainder: 200, packageStock: state.pilot.packageStock }]);
});

test("changing selection amounts never reuses a package check's prior sufficiency", () => {
  const state = stateWith(100);
  state.pilot.batches.push(planned("existing", 2));
  state.pilot.packageStock.push({ ingredientId: "pasta", name: "Dry pasta", packageKind: "bag", status: "some" });
  const check = buildPilotShoppingList(state).checks[0];
  state.pilot.stockChecks.push({ ingredientId: "pasta", unit: "g", fingerprint: check.fingerprint });
  const before = structuredClone(state);
  const smaller = previewUnscheduledShopping(state, [{ recipe, portions: 1 }]);
  const larger = previewUnscheduledShopping(state, [{ recipe, portions: 3 }]);
  assert.equal(smaller.checks[0].required, 300);
  assert.equal(larger.checks[0].required, 500);
  assert.ok(smaller.checks.every((item) => !("resolved" in item) && !("fingerprint" in item)));
  assert.ok(larger.checks.every((item) => !("resolved" in item) && !("fingerprint" in item)));
  assert.deepEqual(state, before);
});

test("empty and zero unscheduled selections add no demand, with strict validation before ignoring zero", () => {
  const state = stateWith();
  state.pilot.batches.push(planned("existing", 6));
  const before = structuredClone(state);
  const empty = { shopThrough: state.pilot.shopThrough, requirements: [], shortages: [], checks: [] };
  assert.deepEqual(previewUnscheduledShopping(state, []), empty);
  assert.deepEqual(previewUnscheduledShopping(state, [{ recipe, portions: 0 }]), empty);
  assert.deepEqual(previewUnscheduledShopping(state, [{ recipe, portions: 0 }, { recipe, portions: 2 }]).shortages,
    [{ ingredientId: "pasta", name: "Dry pasta", unit: "g", quantity: 200, totalQuantity: 800 }]);
  for (const portions of [-1, Infinity, NaN, 1001]) assert.throws(() => previewUnscheduledShopping(state, [{ recipe, portions }]), RangeError);
  for (const portions of [0, 2]) assert.throws(() => previewUnscheduledShopping(state, [{ recipe: { ...recipe, servings: 0 }, portions }]));
  assert.deepEqual(state, before);
});
