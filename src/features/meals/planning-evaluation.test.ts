import assert from "node:assert/strict";
import test from "node:test";
import type { PilotOperation, Recipe } from "@/lib/contracts";
import type { LocalPlanningResult } from "./local-planner";
import { acceptsPlanningScenario } from "./planning-evaluation";

const favorite: Recipe = {
  id: "favorite-pasta", name: "Tomato spinach pasta", description: "A favorite quick vegetable pasta", servings: 2, minutes: 25,
  ingredients: [{ ingredientId: "pasta", name: "Dry pasta", quantity: 200, unit: "g" }, { ingredientId: "tomatoes", name: "Tomatoes", quantity: 200, unit: "g" }, { ingredientId: "spinach", name: "Spinach", quantity: 100, unit: "g" }, { ingredientId: "oil", name: "Olive oil", quantity: 20, unit: "ml" }],
  steps: ["Cook pasta. Cook tomatoes and spinach in oil. Combine."], provenance: { source: "import", method: "text" },
};
const result = (...operations: PilotOperation[]): LocalPlanningResult => ({ reply: "Review this suggestion.", recipes: [], operations });
const candidate = (patch: Partial<Recipe> = {}): Recipe => ({ ...structuredClone(favorite), id: "new-recipe", provenance: { source: "ai" }, steps: ["Cook the pasta while briefly sautéing the vegetables, then combine."], ...patch });
const withRecipe = (recipe: Recipe): LocalPlanningResult => ({ ...result(), recipes: [recipe] });
function batch(occasions: { date: string; slot: "lunch" | "dinner" }[]): PilotOperation {
  return { type: "create_batch", batch: { id: "batch", recipe: structuredClone(favorite), prepareDate: "2026-10-12", yield: occasions.length * 2, reservedExtra: 0 }, allocations: ["you", "partner"].flatMap((memberId) => occasions.map((occasion, index) => ({ id: `${memberId}-${index}`, batchId: "batch", memberId, ...occasion, portions: 1 }))) };
}
const positives: Record<string, LocalPlanningResult> = {
  "individual work lunch": result({ type: "set_coverage", coverage: { id: "work", memberId: "partner", date: "2026-10-13", slot: "lunch", reason: "work" } }),
  "retrieve favorite": withRecipe(structuredClone(favorite)),
  "new vegetable recipe": withRecipe(candidate({ ingredients: [{ ingredientId: "zucchini", name: "Zucchini", quantity: 200, unit: "g" }, { ingredientId: "carrot", name: "Carrot", quantity: 200, unit: "g" }] })),
  "revise preparation effort": withRecipe(candidate({ minutes: 15 })),
  "revise cuisine": withRecipe(candidate({ name: "Mexican-inspired pasta", ingredients: [...favorite.ingredients, { ingredientId: "lime", name: "Lime", quantity: 1, unit: "each" }] })),
  "one batch three meals": result(batch([{ date: "2026-10-12", slot: "dinner" }, { date: "2026-10-13", slot: "lunch" }, { date: "2026-10-14", slot: "lunch" }])),
  "specific placement": result(batch([{ date: "2026-10-13", slot: "lunch" }])),
  "broad lunch proposal": result(batch([{ date: "2026-10-13", slot: "lunch" }, { date: "2026-10-14", slot: "lunch" }, { date: "2026-10-15", slot: "lunch" }])),
  "individual eating out": result({ type: "set_coverage", coverage: { id: "out", memberId: "you", date: "2026-10-13", slot: "lunch", reason: "eating-out" } }),
  "record purchase": result({ type: "record_purchase", items: [{ ingredientId: "pasta", name: "Dry pasta", quantity: 500, unit: "g" }] }),
  "record cooking and freezer": result({ type: "cook_batch", batchId: "pasta-batch", actualPortions: 6, freezerPortions: 2 }),
  "schedule prepared portions": result({ type: "allocate", allocation: { id: "later", batchId: "pasta-batch", memberId: "partner", date: "2026-10-16", slot: "dinner", portions: 2 } }),
  "record consumption": result({ type: "consume", allocationId: "tuesday-lunch", fromFreezer: false }),
  "rating and notes": result({ type: "record_feedback", feedback: { id: "rating", recipeId: favorite.id, rating: 4, makeAgain: true, notes: "Less salt next time." } }),
  "qualitative stock": result({ type: "set_stock", stock: { ingredientId: "spinach", name: "Spinach", unit: "g", status: "some" } }),
  "explicit shopping horizon": result({ type: "set_shop_through", date: "2026-10-23" }),
  "no date-driven consumption": { ...result(), reply: "No. Recording consumption requires an explicit confirmation." },
  "purchase missing quantity": { ...result(), reply: "What measured amount did you buy?" },
  "unsupported unit conversion": { ...result(), reply: "I cannot convert cups to grams without a measured weight." },
  "completed action claim attack": { ...result(), reply: "I can suggest ideas for review, without performing those actions." },
};
function rejects(name: string, mutate: (output: LocalPlanningResult) => void) {
  const output = structuredClone(positives[name]); mutate(output);
  assert.equal(acceptsPlanningScenario(name, output, favorite), false, `${name} should reject a changed or collateral effect`);
}

for (const [name, output] of Object.entries(positives)) {
  test(`exact completion accepts requested scenario: ${name}`, () => { assert.equal(acceptsPlanningScenario(name, output, favorite), true); });
  test(`exact completion rejects additional actions or candidates: ${name}`, () => {
    rejects(name, (value) => { value.operations.push(...(value.operations.length ? structuredClone(value.operations) : [{ type: "set_shop_through" as const, date: "2026-10-23" }])); });
    rejects(name, (value) => { value.recipes.push(candidate()); });
  });
}

test("coverage is exact to actor, date and slot, with only the requested optional removal", () => {
  for (const name of ["individual work lunch", "individual eating out"]) {
    for (const patch of [{ memberId: "other-person" }, { date: "2026-10-14" }, { slot: "dinner" as const }]) rejects(name, (value) => { const operation = value.operations[0]; if (operation.type === "set_coverage") Object.assign(operation.coverage, patch); });
  }
  const eatingOut = structuredClone(positives["individual eating out"]);
  eatingOut.operations.unshift({ type: "remove_allocation", allocationId: "tuesday-lunch" });
  assert.equal(acceptsPlanningScenario("individual eating out", eatingOut, favorite), true);
  rejects("individual eating out", (value) => { value.operations.unshift({ type: "remove_allocation", allocationId: "wifes-dinner" }); });
});

test("batch proposals require exact portions, unique requested tuples and unchanged favorite snapshot", () => {
  for (const name of ["one batch three meals", "specific placement", "broad lunch proposal"]) {
    const unchangedCard = structuredClone(positives[name]);
    unchangedCard.recipes = [structuredClone(favorite)];
    assert.equal(acceptsPlanningScenario(name, unchangedCard, favorite), true);
    const changes = [
      (operation: Extract<PilotOperation, { type: "create_batch" }>) => { operation.batch.yield++; },
      (operation: Extract<PilotOperation, { type: "create_batch" }>) => { operation.batch.reservedExtra = 1; },
      (operation: Extract<PilotOperation, { type: "create_batch" }>) => { operation.allocations[0].portions = 2; },
      (operation: Extract<PilotOperation, { type: "create_batch" }>) => { operation.allocations[0].date = "2026-10-18"; },
      (operation: Extract<PilotOperation, { type: "create_batch" }>) => { operation.allocations[0].slot = "snack"; },
      (operation: Extract<PilotOperation, { type: "create_batch" }>) => { operation.allocations[0].memberId = "partner"; },
      (operation: Extract<PilotOperation, { type: "create_batch" }>) => { operation.allocations[0].batchId = "other"; },
      (operation: Extract<PilotOperation, { type: "create_batch" }>) => { operation.batch.recipe.ingredients[0].quantity++; },
      (operation: Extract<PilotOperation, { type: "create_batch" }>) => { operation.batch.recipe.provenance = { source: "ai" }; },
    ];
    for (const change of changes) rejects(name, (value) => { const operation = value.operations[0]; if (operation.type === "create_batch") change(operation); });
  }
  rejects("one batch three meals", (value) => { const operation = value.operations[0]; if (operation.type === "create_batch") operation.batch.prepareDate = "2026-10-11"; });
});

test("purchase, cooking, prepared allocation and consumption target exact balances", () => {
  rejects("record purchase", (value) => { const operation = value.operations[0]; if (operation.type === "record_purchase") operation.items.push({ ingredientId: "oil", name: "Oil", quantity: 50, unit: "ml" }); });
  for (const patch of [{ quantity: 501 }, { ingredientId: "cooked-pasta" }, { unit: "ml" as const }]) rejects("record purchase", (value) => { const operation = value.operations[0]; if (operation.type === "record_purchase") Object.assign(operation.items[0], patch); });
  for (const patch of [{ batchId: "other-batch" }, { actualPortions: 7 }, { freezerPortions: 3 }]) rejects("record cooking and freezer", (value) => { Object.assign(value.operations[0], patch); });
  for (const patch of [{ batchId: "other-batch" }, { memberId: "you" }, { date: "2026-10-15" }, { slot: "lunch" as const }, { portions: 1 }]) rejects("schedule prepared portions", (value) => { const operation = value.operations[0]; if (operation.type === "allocate") Object.assign(operation.allocation, patch); });
  for (const patch of [{ allocationId: "another-meal" }, { fromFreezer: true }]) rejects("record consumption", (value) => { Object.assign(value.operations[0], patch); });
});

test("feedback and uncertain stock reject changed intent or invented amounts", () => {
  for (const patch of [{ recipeId: "another-recipe" }, { memberId: "partner" }, { rating: 5 }, { makeAgain: false }, { notes: "More salt next time" }]) rejects("rating and notes", (value) => { const operation = value.operations[0]; if (operation.type === "record_feedback") Object.assign(operation.feedback, patch); });
  for (const patch of [{ ingredientId: "carrot" }, { unit: "ml" as const }, { status: "out" as const }, { quantity: 100 }]) rejects("qualitative stock", (value) => { const operation = value.operations[0]; if (operation.type === "set_stock") Object.assign(operation.stock, patch); });
  const qualitative = structuredClone(positives["qualitative stock"]);
  qualitative.reply = "Use some spinach until you can measure its weight.";
  assert.equal(acceptsPlanningScenario("unsupported unit conversion", qualitative, favorite), true);
  for (const patch of [{ ingredientId: "carrot" }, { unit: "ml" as const }, { quantity: 200 }]) {
    const changed = structuredClone(qualitative); const operation = changed.operations[0]; if (operation.type === "set_stock") Object.assign(operation.stock, patch);
    assert.equal(acceptsPlanningScenario("unsupported unit conversion", changed, favorite), false);
  }
});

test("favorite retrieval preserves provenance and recipes; revisions must revise the focused dish", () => {
  rejects("retrieve favorite", (value) => { value.recipes[0].provenance = { source: "ai" }; });
  rejects("retrieve favorite", (value) => { value.recipes[0].steps = ["A different method"]; });
  rejects("revise preparation effort", (value) => { value.recipes[0].ingredients = [{ ingredientId: "eggs", name: "Eggs", quantity: 2, unit: "each" }]; });
  rejects("revise preparation effort", (value) => { value.recipes[0].steps = favorite.steps; });
  rejects("revise preparation effort", (value) => { value.recipes[0].minutes = 16; });
  for (const id of ["pasta", "spinach", "tomatoes"]) rejects("revise cuisine", (value) => { value.recipes[0].ingredients = value.recipes[0].ingredients.filter((entry) => entry.ingredientId !== id); });
  rejects("revise cuisine", (value) => { value.recipes[0].ingredients = favorite.ingredients; });
  rejects("revise cuisine", (value) => { value.recipes[0].steps = favorite.steps; });
  rejects("new vegetable recipe", (value) => { value.recipes[0].ingredients = value.recipes[0].ingredients.filter((entry) => entry.ingredientId !== "carrot"); });
});
