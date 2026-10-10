import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV4 } from "ai/test";
import { chatMealsRequestSchema, householdStateSchema, suggestMealsRequestSchema, type Recipe } from "@/lib/contracts";
import { applyPilotCommand, buildPilotShoppingList, ensurePilot } from "@/features/planning/pilot";
import { buildRecommendationContext, recommendationContextForMessage, recommendationContextKey, resolveRecommendationContext } from "./recommendation-context";
import { createMealTools, liveSuggestMeals } from "./live-provider";
import { reviewLocalPlanningWire, runLocalPlanning } from "./local-planner";
import { createMealHandlers } from "./api-handlers";

const state = () => ensurePilot(householdStateSchema.parse({ version: 1, pantry: [], meals: [],
  preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true } }), "2026-10-12");
const recipe: Recipe = { id: "beans", name: "White beans", description: "An imported bean recipe", servings: 2, minutes: 20,
  ingredients: [{ ingredientId: "beans", name: "Canned white beans", quantity: 600, unit: "g" }], steps: ["Warm the beans."], provenance: { source: "import", method: "text" } };
const chat = (current: ReturnType<typeof state>, message = "Show favorites") => ({ pantry: current.pantry, preferences: current.preferences,
  meals: [], recipeBox: current.workspace.recipeBox, messages: [], message, recommendationContext: buildRecommendationContext(current, "you") });
const output = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }], finishReason: { unified: "stop" as const, raw: undefined },
  usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } }, warnings: [] });

test("bounded transport carries current values and audience without profile provenance or unrelated people", () => {
  let current = state();
  for (const memberId of ["you", "partner"]) current = applyPilotCommand(current, { id: memberId, expectedRevision: current.pilot.revision,
    operation: { type: "upsert_profile_fact", value: { kind: "food-dislike", scope: { kind: "member", memberId }, target: { kind: "category", category: "vegetables" }, disliked: true }, sourceText: "Private source text" } }).state;
  current.pilot.session.memberIds = ["you"];
  const context = buildRecommendationContext(current, "partner");
  assert.equal(context.profileFacts.length, 1);
  assert.equal(context.profileFacts[0].kind === "food-dislike" && context.profileFacts[0].scope.kind === "member" && context.profileFacts[0].scope.memberId, "you");
  assert.deepEqual(context.members.map((member) => member.id), ["you"]);
  assert.equal(JSON.stringify(context).includes("Private source text"), false);
  const key = recommendationContextKey(current, "partner");
  current.pilot.profileFacts[0].source.sourceText = "Changed evidence wording";
  current.pilot.profileFacts.reverse();
  assert.equal(recommendationContextKey(current, "partner"), key);
  for (const schema of [suggestMealsRequestSchema, chatMealsRequestSchema]) {
    const parsed = schema.parse({ ...chat(current), recommendationContext: { ...context, receipts: ["not transmitted"], history: "not transmitted" } });
    assert.deepEqual(parsed.recommendationContext, context);
    assert.equal(schema.safeParse({ ...chat(current), recommendationContext: { ...context, favorites: Array.from({ length: 21 }, () => recipe) } }).success, false);
  }
});

test("API forwards the same typed projection to browser providers for suggest and chat", async () => {
  const current = state();
  const projection = buildRecommendationContext(current, "you");
  const seen: unknown[] = [];
  const handlers = createMealHandlers({ suggest: async (input) => { seen.push(input.recommendationContext); return { source: "demo", recipes: [] }; },
    chat: async (input) => { seen.push(input.recommendationContext); return { source: "demo", reply: "Try another sample.", recipes: [], servings: 2 }; } });
  for (const kind of ["suggest", "chat"] as const) {
    const response = await handlers[kind](new Request(`http://localhost/api/meals/${kind}`, { method: "POST", body: JSON.stringify(chat(current)) }));
    assert.equal(response.status, 200);
  }
  assert.deepEqual(seen, [projection, projection]);
});

test("server kitchen overrides browser hints and a human correction affects this answer only", () => {
  let current = state();
  current = applyPilotCommand(current, { id: "dislike", expectedRevision: 0, operation: { type: "upsert_profile_fact",
    value: { kind: "food-dislike", scope: { kind: "member", memberId: "you" }, target: { kind: "category", category: "vegetables" }, disliked: true }, sourceText: "I dislike vegetables" } }).state;
  const canonical = buildRecommendationContext(current, "you");
  const hint = { ...canonical, profileFacts: [] };
  assert.deepEqual(resolveRecommendationContext({ recommendationContext: hint }, current, "you"), canonical);
  const transient = recommendationContextForMessage(canonical, "Actually, I like vegetables now. Suggest dinner.")!;
  assert.equal(transient.profileFacts[0].kind === "food-dislike" && transient.profileFacts[0].disliked, false);
  assert.equal(canonical.profileFacts[0].kind === "food-dislike" && canonical.profileFacts[0].disliked, true);
  assert.deepEqual(recommendationContextForMessage(canonical, "No vegetables tonight."), canonical);
});

test("favorite tools use the same audience ranking and exclusions as the projection", () => {
  const current = state();
  current.workspace.recipeBox = [{ recipe, source: "import" }];
  current.pilot.feedback = [{ id: "no", memberId: "you", recipeId: recipe.id, rating: 1, makeAgain: false, notes: "Skip" },
    { id: "yes", memberId: "partner", recipeId: recipe.id, rating: 5, makeAgain: true, notes: "Favorite" }];
  current.pilot.session.memberIds = ["you"];
  assert.deepEqual(createMealTools(chat(current), current, "you").findSavedRecipes({ query: "" }), []);
  current.pilot.session.memberIds = ["partner"];
  const found = createMealTools(chat(current), current, "you").findSavedRecipes({ query: "" });
  assert.deepEqual(found[0].recipe, recipe);
  current.pilot.session.rejectedRecipeIds = [recipe.id];
  assert.deepEqual(createMealTools(chat(current), current, "you").findSavedRecipes({ query: "" }), []);
});

test("recipe preview keeps measured stock and packages distinct and cannot borrow a batch-specific confirmation", () => {
  let current = state();
  current.pantry = [{ id: "beans", name: "Canned white beans", quantity: 400, unit: "g", location: "Cupboard", useSoon: false, tag: "special" }];
  current.workspace.recipeBox = [{ recipe, source: "import" }];
  current.pilot.packageStock = [{ ingredientId: "beans", name: "Canned white beans", packageKind: "can", status: "exact", count: 10 }];
  current.pilot.batches = [{ id: "actual-batch", recipe, prepareDate: "2026-10-12", yield: 2, reservedExtra: 0, status: "planned" }];
  const pending = buildPilotShoppingList(current).checks[0];
  current = applyPilotCommand(current, { id: "confirm", expectedRevision: 0, operation: { type: "confirm_stock", ingredientId: "beans", unit: "g", fingerprint: pending.fingerprint } }).state;
  assert.equal(buildPilotShoppingList(current).checks[0].resolved, true);
  for (const tools of [createMealTools(chat(current), current, "you"), createMealTools(chat(current))]) {
    const preview = tools.findSavedRecipes({ query: "" })[0];
    assert.deepEqual(preview.shortages, []);
    assert.equal(preview.stockChecks?.[0].knownAvailable, 400);
    assert.equal(preview.stockChecks?.[0].knownRemainder, 200);
    assert.equal(preview.stockChecks?.[0].resolved, false);
  }
  current = applyPilotCommand(current, { id: "correct", expectedRevision: current.pilot.revision,
    operation: { type: "set_package_stock", stock: { ...current.pilot.packageStock[0], count: 5 } } }).state;
  assert.equal(buildPilotShoppingList(current).checks[0].resolved, false);
});

test("model prompts retain the bounded kitchen without unfiltered feedback, metadata or stale quantities", async () => {
  const current = state();
  current.pilot.session.memberIds = ["you"];
  current.pilot.members[1].preferences = "Outside audience private preference";
  current.pilot.feedback = [{ id: "old", recipeId: recipe.id, memberId: "you", rating: 1, makeAgain: false, notes: "Obsolete feedback" },
    { id: "new", recipeId: recipe.id, memberId: "you", rating: 5, makeAgain: true, notes: "Current feedback" },
    { id: "outside", recipeId: recipe.id, memberId: "partner", rating: 1, makeAgain: false, notes: "Outside audience opinion" }];
  const model = new MockLanguageModelV4({ doGenerate: output({ intent: "discuss", reply: "Review current preferences." }) });
  await runLocalPlanning(current, "Explain my kitchen preferences.", { verify: false, model });
  const serialized = JSON.stringify(model.doGenerateCalls[0].prompt);
  assert.equal(serialized.includes("Obsolete feedback"), false);
  assert.equal(serialized.includes("Outside audience"), false);
  assert.equal(serialized.includes("Current feedback"), true);
  const suggest = new MockLanguageModelV4({ doGenerate: output({ recipes: [], explanation: "Choose a meal type." }) });
  await liveSuggestMeals({ pantry: current.pantry, preferences: current.preferences, recommendationContext: buildRecommendationContext(current, "you") }, { model: suggest });
  assert.equal(JSON.stringify(suggest.doGenerateCalls[0].prompt).includes("Current feedback"), true);
});

test("local recipe review enforces typed preferences while a current correction preserves the original snapshot", () => {
  let current = state();
  current.workspace.recipeBox = [{ recipe, source: "import" }];
  current = applyPilotCommand(current, { id: "dislike", expectedRevision: 0, operation: { type: "upsert_profile_fact",
    value: { kind: "food-dislike", scope: { kind: "member", memberId: "you" }, target: { kind: "ingredient", ingredientId: "beans", name: "Canned white beans" }, disliked: true }, sourceText: "I dislike canned white beans" } }).state;
  const favorite = { intent: "favorite", reply: "Review the original recipe.", favoriteRecipeIds: [recipe.id] };
  assert.throws(() => reviewLocalPlanningWire(current, favorite, "you", "Show favorites."), /conflicts/);
  const generated = { intent: "generate", reply: "Review a new idea.", recipes: [{ name: "Fresh idea", description: recipe.description,
    servings: recipe.servings, minutes: recipe.minutes, ingredients: recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })), steps: recipe.steps }] };
  assert.throws(() => reviewLocalPlanningWire(current, generated, "you", "Suggest dinner."), /conflicts/);
  const corrected = reviewLocalPlanningWire(current, favorite, "you", "Actually, I like canned white beans now. Show favorites.");
  assert.deepEqual(corrected.recipes, [recipe]);
  assert.equal(current.pilot.profileFacts[0].value.kind === "food-dislike" && current.pilot.profileFacts[0].value.disliked, true);
});
