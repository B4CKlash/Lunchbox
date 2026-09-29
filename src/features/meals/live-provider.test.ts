import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { createSampleHousehold } from "@/features/pantry/seed";
import { buildShoppingList } from "@/features/planning/shopping";
import { type ChatMealsRequest, type Recipe } from "@/lib/contracts";
import { createMealTools, liveChatAboutMeals, liveSuggestMeals } from "./live-provider";
import { AiRuntimeError, generateStructured, publicAiError } from "./ai-runtime";

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } };
const textResult = (output: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(output) }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] });
const callResult = (toolName: string, input: unknown) => ({ content: [{ type: "tool-call" as const, toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) }], finishReason: { unified: "tool-calls" as const, raw: undefined }, usage, warnings: [] });
const context = (message = "Suggest dinner"): ChatMealsRequest => {
  const state = createSampleHousehold();
  return { pantry: state.pantry, preferences: state.preferences, meals: [], recipeBox: [], messages: [], message };
};
const candidate = () => ({ name: "Rice and mushrooms", description: "A quick dinner.", servings: 2, minutes: 20, ingredients: [
  { ingredientId: "rice", name: "Jasmine rice", quantity: 150, unit: "g" as const },
  { ingredientId: null, name: "Fresh mushrooms", quantity: 200, unit: "g" as const },
], steps: ["Cook the rice using its package instructions, then serve with sautéed mushrooms."] });
const favorite = (): Recipe => ({ ...candidate(), id: "favorite-original", ingredients: [{ ingredientId: "rice", name: "Jasmine rice", quantity: 150, unit: "g" }], provenance: { source: "import", method: "url", sourceUrl: "https://example.com/rice", title: "Original source" } });

test("fake-model tool loop returns normalized missing ingredients and exact scaled groceries", async () => {
  const input = context();
  input.preferences.servings = 4;
  input.pantry = [{ id: "rice", name: "Jasmine rice", quantity: 200, unit: "g", location: "Cupboard", useSoon: false }];
  const before = structuredClone(input);
  const model = new MockLanguageModelV4({ doGenerate: [callResult("evaluateRecipes", { recipes: [candidate()], servings: 4 }), textResult({ reply: "Here is an idea.", recipeRefs: ["proposal:1"], servings: 4 })] });
  const result = await liveChatAboutMeals(input, { model });
  assert.equal(result.source, "ai");
  assert.equal(result.servings, 4);
  assert.equal(result.recipes[0].servings, 2);
  assert.match(result.recipes[0].id, /^ai-/);
  assert.equal(result.recipes[0].provenance?.source, "ai");
  assert.equal(result.recipes[0].ingredients[1].ingredientId, "mushrooms");
  const shopping = buildShoppingList(input.pantry, [{ id: "planned", recipe: result.recipes[0], servings: 4 }]);
  assert.equal(shopping.find((item) => item.ingredientId === "rice")?.quantity, 100);
  assert.equal(shopping.find((item) => item.ingredientId === "mushrooms")?.quantity, 400);
  assert.deepEqual(input, before);
  assert.equal(model.doGenerateCalls.length, 2);
  assert.ok(model.doGenerateCalls.every((call) => call.maxOutputTokens === 4000));
  assert.notEqual(model.doGenerateCalls[0].responseFormat?.type, "json");
  assert.equal(model.doGenerateCalls[0].tools?.length, 3);
  assert.equal(model.doGenerateCalls[1].responseFormat?.type, "json");
  assert.equal(model.doGenerateCalls[1].tools?.length ?? 0, 0);
});

test("favorite tool preserves the original imported snapshot and evaluates requested portions", async () => {
  const input = context("Show my favorite rice recipe for four");
  input.recipeBox = [{ recipe: favorite(), source: "import" }];
  const model = new MockLanguageModelV4({ doGenerate: [callResult("findSavedRecipes", { query: "rice", servings: 4 }), textResult({ note: "The requested favorite is available as saved:0." }), textResult({ reply: "Your saved recipe is ready to plan.", recipeRefs: ["saved:0"], servings: 4 })] });
  const result = await liveChatAboutMeals(input, { model });
  assert.deepEqual(result.recipes, [favorite()]);
  assert.equal(result.source, "ai");
  assert.equal(result.recipes[0].provenance?.source, "import");
});

test("a saved favorite can be found then revised before finalizing within three calls", async () => {
  const input = context("Add mushrooms to my favorite rice recipe for four");
  input.recipeBox = [{ recipe: favorite(), source: "import" }];
  const before = structuredClone(input);
  const model = new MockLanguageModelV4({ doGenerate: [
    callResult("findSavedRecipes", { query: "rice", servings: 4 }),
    callResult("evaluateRecipes", { recipes: [candidate()], servings: 4 }),
    textResult({ reply: "Here is a new version with mushrooms.", recipeRefs: ["proposal:2"], servings: 4 }),
  ] });
  const result = await liveChatAboutMeals(input, { model });
  assert.equal(model.doGenerateCalls.length, 3);
  assert.match(result.recipes[0].id, /^ai-/);
  assert.notEqual(result.recipes[0].id, input.recipeBox[0].recipe.id);
  assert.equal(result.recipes[0].provenance?.source, "ai");
  assert.equal(result.recipes[0].ingredients[1].ingredientId, "mushrooms");
  assert.deepEqual(input, before);
});

test("legacy favorites gain honest saved-source metadata without changing the saved object", () => {
  const input = context();
  const recipe = favorite();
  delete recipe.provenance;
  input.recipeBox = [{ recipe, source: "demo" }];
  const found = createMealTools(input).findSavedRecipes({ query: "", servings: 2 });
  assert.equal(found[0].recipe.provenance?.source, "demo");
  assert.equal(input.recipeBox[0].recipe.provenance, undefined);
  assert.equal(found[0].recipe.id, recipe.id);
});

test("custom ingredients combine across recipes and units stay separate", () => {
  const input = context();
  input.pantry = [];
  const tools = createMealTools(input);
  const recipe = { ...candidate(), ingredients: [{ ingredientId: null, name: "Aji amarillo paste", quantity: 20, unit: "g" as const }] };
  const evaluated = tools.evaluateRecipes({ recipes: [recipe, { ...recipe, name: "Another dish" }], servings: 2 });
  assert.equal(evaluated.recipes.length, 2);
  const recipes = evaluated.recipes.map((entry) => entry.recipe);
  assert.equal(recipes[0].ingredients[0].ingredientId, recipes[1].ingredients[0].ingredientId);
  const id = recipes[0].ingredients[0].ingredientId;
  const shopping = buildShoppingList([{ id, name: "Aji amarillo paste", quantity: 100, unit: "ml", location: "Fridge", useSoon: false }], recipes.map((recipe, index) => ({ id: String(index), recipe, servings: 2 })));
  assert.equal(shopping[0].quantity, 40);
  assert.equal(shopping[0].unit, "g");
});

test("ambiguous legacy identities, invented IDs, and time violations cannot become proposals", () => {
  const input = context();
  input.pantry = ["one", "two"].map((id) => ({ id, name: "Fresh mushrooms", quantity: 100, unit: "g", location: "Fridge", useSoon: false }));
  const tools = createMealTools(input);
  const ambiguous = tools.evaluateRecipes({ recipes: [{ ...candidate(), ingredients: [{ ingredientId: null, name: "Mushrooms", quantity: 200, unit: "g" }] }], servings: 2 });
  assert.equal(ambiguous.recipes.length, 0);
  assert.match(ambiguous.errors[0], /clarify/);
  const invented = tools.evaluateRecipes({ recipes: [candidate()], servings: 2 });
  assert.equal(invented.recipes.length, 0);
  const tooSlow = tools.evaluateRecipes({ recipes: [{ ...candidate(), minutes: 100 }], servings: 2 });
  assert.equal(tooSlow.recipes.length, 0);
  assert.equal(tools.proposals.size, 0);
});

test("reviewPlan combines demand once and focused inspection respects selected servings", () => {
  const input = context();
  input.pantry = [{ id: "rice", name: "Jasmine rice", quantity: 200, unit: "g", location: "Cupboard", useSoon: false }];
  input.meals = [{ id: "a", recipe: favorite(), servings: 4 }, { id: "b", recipe: favorite(), servings: 2 }];
  input.focusedRecipe = favorite();
  input.focusedServings = 4;
  const tools = createMealTools(input);
  assert.equal(tools.reviewPlan().shortages?.[0].quantity, 250);
  assert.equal(tools.reviewPlan({ scope: "focused" }).shortages?.[0].quantity, 100);
  assert.equal(input.pantry[0].quantity, 200);
});

test("model IDs cannot override a contradictory physical form or ambiguous name", () => {
  for (const ingredient of [
    { ingredientId: "rice", name: "Cooked rice", quantity: 150, unit: "g" as const },
    { ingredientId: "lentils", name: "Dry lentils", quantity: 150, unit: "g" as const },
  ]) {
    const tools = createMealTools(context());
    const result = tools.evaluateRecipes({ recipes: [{ ...candidate(), ingredients: [ingredient] }], servings: 2 });
    assert.equal(result.recipes.length, 0);
    assert.match(result.errors[0], /does not match supplied ingredient ID/);
    assert.equal(tools.proposals.size, 0);
  }
  const input = context();
  input.pantry = ["mushrooms-one", "mushrooms-two"].map((id) => ({ id, name: "Fresh mushrooms", quantity: 100, unit: "g", location: "Fridge", useSoon: false }));
  const tools = createMealTools(input);
  const result = tools.evaluateRecipes({ recipes: [{ ...candidate(), ingredients: [{ ingredientId: "mushrooms-one", name: "Mushrooms", quantity: 100, unit: "g" }] }], servings: 2 });
  assert.equal(result.recipes.length, 0);
  assert.match(result.errors[0], /clarify/);
});

test("authored canonical aliases remain valid with the matching model ID", () => {
  const tools = createMealTools(context());
  const result = tools.evaluateRecipes({ recipes: [{ ...candidate(), ingredients: [{ ingredientId: "tomatoes", name: "Fresh tomatoes", quantity: 100, unit: "g" }] }], servings: 2 });
  assert.equal(result.recipes.length, 1);
  assert.equal(result.recipes[0].recipe.ingredients[0].ingredientId, "tomatoes");
});

test("unregistered references and mismatched evaluation portions are rejected", async () => {
  for (const outputs of [
    [textResult({ note: "No recipe has been evaluated." }), textResult({ reply: "Here.", recipeRefs: ["invented"], servings: 2 })],
    [callResult("evaluateRecipes", { recipes: [candidate()], servings: 2 }), textResult({ reply: "Here.", recipeRefs: ["proposal:1"], servings: 4 })],
  ]) {
    await assert.rejects(liveChatAboutMeals(context(), { model: new MockLanguageModelV4({ doGenerate: outputs }) }), (error: unknown) => error instanceof AiRuntimeError && error.code === "invalid_output");
  }
});

test("suggestions retain the configured serving count and use the same normalized recipe path", async () => {
  const input = context();
  const model = new MockLanguageModelV4({ doGenerate: [callResult("evaluateRecipes", { recipes: [candidate()], servings: 2 }), textResult({ reply: "Dinner ideas.", recipeRefs: ["proposal:1"], servings: 2 })] });
  const result = await liveSuggestMeals(input, { model });
  assert.equal(result.source, "ai");
  assert.equal(result.recipes[0].ingredients[1].ingredientId, "mushrooms");
});

test("runtime allows one failed proposal repair and finalizes with no tools within three calls", async () => {
  const input = context();
  const model = new MockLanguageModelV4({ doGenerate: [callResult("evaluateRecipes", { recipes: [{ ...candidate(), minutes: 100 }], servings: 2 }), callResult("evaluateRecipes", { recipes: [candidate()], servings: 2 }), textResult({ reply: "A quick dinner.", recipeRefs: ["proposal:1"], servings: 2 })] });
  await liveChatAboutMeals(input, { model });
  assert.equal(model.doGenerateCalls.length, 3);
  assert.ok(model.doGenerateCalls.slice(0, 2).every((call) => call.responseFormat?.type !== "json" && (call.tools?.length ?? 0) > 0));
  assert.equal(model.doGenerateCalls[2].tools?.length ?? 0, 0);
  assert.equal(model.doGenerateCalls[2].responseFormat?.type, "json");
});

test("runtime aborts before calling the model and categorizes malformed output without retries", async () => {
  const controller = new AbortController();
  controller.abort();
  const model = new MockLanguageModelV4({ doGenerate: textResult({ ok: true }) });
  await assert.rejects(generateStructured({ schema: z.object({ ok: z.boolean() }), instructions: "Test", prompt: "Private pantry", operation: "chat", signal: controller.signal, model }), (error: unknown) => error instanceof AiRuntimeError && error.code === "cancelled");
  assert.equal(model.doGenerateCalls.length, 0);
  const malformed = new MockLanguageModelV4({ doGenerate: textResult({ wrong: true }) });
  await assert.rejects(generateStructured({ schema: z.object({ ok: z.boolean() }), instructions: "Test", prompt: "Private pantry", operation: "chat", model: malformed }), (error: unknown) => error instanceof AiRuntimeError && error.code === "invalid_output");
  assert.equal(malformed.doGenerateCalls.length, 1);
});

test("public errors never expose provider messages or response bodies", () => {
  for (const [statusCode, code] of [[402, "credits"], [429, "rate_limit"], [401, "configuration"], [504, "timeout"]] as const) {
    const result = publicAiError(Object.assign(new Error("secret provider payload"), { statusCode }));
    assert.equal(result.code, code);
    assert.ok(!JSON.stringify(result).includes("secret"));
  }
});
