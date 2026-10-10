import assert from "node:assert/strict";
import test from "node:test";
import type { PilotOperation, ProfileFactChange, Recipe } from "@/lib/contracts";
import type { LocalPlanningResult } from "./local-planner";
import { acceptsKnowledgePlanningScenario, acceptsPlanningScenario, originalPlanningScenarioNames, planningEvaluationReleaseGate, unsupportedPackageSufficiencyClaim, type KnowledgeExpectation, type PlanningEvaluationRun } from "./planning-evaluation";

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

const memory: ProfileFactChange = {
  type: "upsert_profile_fact", value: { kind: "food-dislike", scope: { kind: "member", memberId: "partner" }, target: { kind: "ingredient", ingredientId: "mushrooms", name: "Fresh mushrooms" }, disliked: true }, sourceText: "I don't like mushrooms.",
};

test("profile completion requires exact scope, target, value, source text and no collateral effects", () => {
  const expected: KnowledgeExpectation = { kind: "profile", changes: [memory] };
  const output: LocalPlanningResult = { ...result(), profileChanges: [structuredClone(memory)] };
  assert.equal(acceptsKnowledgePlanningScenario(output, expected), true);
  for (const change of [
    (entry: ProfileFactChange) => { entry.sourceText = "Invented previous conversation"; },
    (entry: ProfileFactChange) => { if (entry.type === "upsert_profile_fact" && entry.value.kind === "food-dislike") entry.value.scope = { kind: "household" }; },
    (entry: ProfileFactChange) => { if (entry.type === "upsert_profile_fact" && entry.value.kind === "food-dislike") entry.value.disliked = false; },
    (entry: ProfileFactChange) => { if (entry.type === "upsert_profile_fact" && entry.value.kind === "food-dislike") entry.value.target = { kind: "category", category: "vegetables" }; },
  ]) {
    const changed = structuredClone(output); change(changed.profileChanges![0]);
    assert.equal(acceptsKnowledgePlanningScenario(changed, expected), false);
  }
  assert.equal(acceptsKnowledgePlanningScenario({ ...output, operations: [{ type: "set_shop_through", date: "2026-10-23" }] }, expected), false);
  assert.equal(acceptsKnowledgePlanningScenario({ ...output, recipes: [candidate()] }, expected), false);
  assert.equal(acceptsKnowledgePlanningScenario({ ...output, profileChanges: [memory, memory] }, expected), false);
  assert.equal(acceptsKnowledgePlanningScenario(result(), expected), false);
  const removal: ProfileFactChange = { type: "remove_profile_fact", factId: "exact-member-target", sourceText: "Forget that preference." };
  assert.equal(acceptsKnowledgePlanningScenario({ ...result(), profileChanges: [removal] }, { kind: "profile", changes: [removal] }), true);
  assert.equal(acceptsKnowledgePlanningScenario({ ...result(), profileChanges: [{ ...removal, factId: "different-target" }] }, { kind: "profile", changes: [removal] }), false);
  assert.equal(acceptsPlanningScenario("retrieve favorite", { ...positives["retrieve favorite"], profileChanges: [memory] }, favorite), false);
});

test("recipe knowledge checks reject unavailable oven use and disliked categories while retaining scoped ingredients", () => {
  const output = withRecipe(candidate({ ingredients: [{ ingredientId: "mushrooms", name: "Fresh mushrooms", quantity: 100, unit: "g" }], steps: ["Sauté mushrooms in a pan and serve."] }));
  assert.equal(acceptsKnowledgePlanningScenario(output, { kind: "recipe", unavailableOven: true, requiredIngredientId: "mushrooms" }), true);
  assert.equal(acceptsKnowledgePlanningScenario(output, { kind: "recipe", forbiddenCategory: "vegetables" }), false);
  assert.equal(acceptsKnowledgePlanningScenario(withRecipe(candidate({ ingredients: [{ ingredientId: "pasta", name: "Dry pasta", quantity: 200, unit: "g" }] })), { kind: "recipe", forbiddenCategory: "vegetables" }), true);
  for (const steps of [["Bake the mushrooms."], ["Preheat an oven."], ["Put mushrooms into the oven."], ["Roast until tender."]]) {
    assert.equal(acceptsKnowledgePlanningScenario({ ...output, recipes: [{ ...output.recipes[0], steps }] }, { kind: "recipe", unavailableOven: true }), false);
  }
  assert.equal(acceptsKnowledgePlanningScenario({ ...output, recipes: [{ ...output.recipes[0], ingredients: [] }] }, { kind: "recipe", requiredIngredientId: "mushrooms" }), false);
  assert.equal(acceptsKnowledgePlanningScenario({ ...output, profileChanges: [memory] }, { kind: "recipe" }), false);
  assert.equal(acceptsKnowledgePlanningScenario(withRecipe({ ...output.recipes[0], provenance: { source: "demo" } }), { kind: "recipe" }), false);
});

test("package completion preserves canonical identity, total versus purchase, whole counts and original observation", () => {
  const expected: KnowledgeExpectation = { kind: "package-total", ingredientId: "beans", packageKind: "can", status: "exact", count: 10, sourceText: "I have 10 cans of canned white beans" };
  const output = result({ type: "set_package_stock", stock: { ingredientId: "beans", name: "Canned white beans", packageKind: "can", status: "exact", count: 10, sourceNote: expected.sourceText } });
  assert.equal(acceptsKnowledgePlanningScenario(output, expected), true);
  for (const patch of [{ ingredientId: "dry-beans" }, { packageKind: "jar" as const }, { count: 11 }, { count: 0.5 }, { status: "some" as const }, { sourceNote: "Unattributed" }]) {
    const changed = structuredClone(output); const operation = changed.operations[0];
    if (operation.type === "set_package_stock") Object.assign(operation.stock, patch);
    assert.equal(acceptsKnowledgePlanningScenario(changed, expected), false);
  }
  const partial: KnowledgeExpectation = { kind: "package-total", ingredientId: "tomato-sauce", packageKind: "jar", status: "some", sourceText: "I have half a jar of tomato sauce" };
  const partialOutput = result({ type: "set_package_stock", stock: { ingredientId: "tomato-sauce", name: "Tomato sauce", packageKind: "jar", status: "some", sourceNote: partial.sourceText } });
  assert.equal(acceptsKnowledgePlanningScenario(partialOutput, partial), true);
  const operation = partialOutput.operations[0]; if (operation.type === "set_package_stock") operation.stock.count = 0.5;
  assert.equal(acceptsKnowledgePlanningScenario(partialOutput, partial), false);
  const purchase: KnowledgeExpectation = { kind: "package-purchase", ingredientId: "tomato-sauce", packageKind: "jar", count: 3, sourceText: "I bought 3 jars of tomato sauce" };
  const purchased = result({ type: "record_package_purchase", items: [{ ingredientId: "tomato-sauce", name: "Tomato sauce", packageKind: "jar", count: 3, sourceNote: purchase.sourceText }] });
  assert.equal(acceptsKnowledgePlanningScenario(purchased, purchase), true);
  assert.equal(acceptsKnowledgePlanningScenario(purchased, expected), false);
  assert.equal(acceptsKnowledgePlanningScenario(output, purchase), false);
});

test("package explanations keep known stock and unverified remainder distinct without a guessed container conversion", () => {
  const expected: KnowledgeExpectation = { kind: "package-check", knownAvailable: 100, knownRemainder: 500, unit: "g" };
  const output = { ...result(), reply: "You have 100 g measured pasta. The remaining 500 g is unverified because the box contents are unknown; weigh them to confirm enough for this batch." };
  assert.equal(acceptsKnowledgePlanningScenario(output, expected), true);
  for (const reply of ["The two boxes are enough.", "Each box contains 500 g, so you have enough.", "You have 100 g; please check the boxes.", "There is a 500 g definite shortage. You have 100 g."]) {
    assert.equal(acceptsKnowledgePlanningScenario({ ...output, reply }, expected), false);
  }
  assert.equal(unsupportedPackageSufficiencyClaim("You have enough pasta."), true);
  assert.equal(unsupportedPackageSufficiencyClaim("We cannot know whether the boxes are enough."), false, "an unresolved question is not an assertion of sufficiency");
  assert.equal(unsupportedPackageSufficiencyClaim("We cannot confirm enough without checking."), false);
  assert.equal(acceptsKnowledgePlanningScenario({ ...output, operations: [{ type: "set_stock", stock: { ingredientId: "pasta", name: "Dry pasta", unit: "g", status: "exact", quantity: 600 } }] }, expected), false);
});

function gateRuns(names: string[] = [...originalPlanningScenarioNames, "extension"]): PlanningEvaluationRun[] {
  return [1, 2].flatMap((pass) => names.map((scenario) => ({ scenario, pass, completed: true, unsupportedClaims: false, invalidStateChanges: false, invalidProposedChanges: false })));
}

test("evaluation gate requires original twenty twice, full extension coverage, zero invalid accepted outputs and stable sources", () => {
  const requiredScenarios = [...originalPlanningScenarioNames, "extension"];
  const input = { results: gateRuns(), requiredScenarios, passes: 2, sourcesUnchanged: true };
  assert.equal(planningEvaluationReleaseGate(input), true);
  assert.equal(planningEvaluationReleaseGate({ ...input, sourcesUnchanged: false }), false);
  assert.equal(planningEvaluationReleaseGate({ ...input, results: input.results.slice(1) }), false);
  assert.equal(planningEvaluationReleaseGate({ ...input, results: input.results.map((run, index) => index === 0 ? { ...run, pass: 2 } : run) }), false);
  assert.equal(planningEvaluationReleaseGate({ ...input, results: input.results.filter((run) => run.pass === 1), passes: 1 }), false);
  for (const flag of ["unsupportedClaims", "invalidStateChanges", "invalidProposedChanges"] as const) {
    assert.equal(planningEvaluationReleaseGate({ ...input, results: input.results.map((run, index) => index === 0 ? { ...run, [flag]: true } : run) }), false);
  }
});

test("easy extensions cannot mask an original planning regression below ninety percent", () => {
  const requiredScenarios = [...originalPlanningScenarioNames, ...Array.from({ length: 20 }, (_, index) => `extension-${index}`)];
  const results = gateRuns(requiredScenarios).map((run, index) => ({ ...run, completed: index >= 5 }));
  assert.equal(results.filter((run) => run.completed).length / results.length >= .9, true);
  assert.equal(planningEvaluationReleaseGate({ results, requiredScenarios, passes: 2, sourcesUnchanged: true }), false);
  assert.equal(planningEvaluationReleaseGate({ results: gateRuns().map((run, index) => ({ ...run, completed: index >= 4 })), requiredScenarios: [...originalPlanningScenarioNames, "extension"], passes: 2, sourcesUnchanged: true }), true, "exactly ninety percent of the original group passes");
});
