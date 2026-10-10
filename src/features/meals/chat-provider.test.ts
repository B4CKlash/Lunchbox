import assert from "node:assert/strict";
import test from "node:test";
import {
  chatMealsResponseSchema,
  type ChatMealsRequest,
  type Recipe,
  type ProfileFactValue,
} from "@/lib/contracts";
import { createSampleHousehold } from "@/features/pantry/seed";
import { ensurePilot } from "@/features/planning/pilot";
import { profileFactId } from "@/features/planning/profile";
import { buildRecommendationContext } from "./recommendation-context";
import { chatAboutMeals } from "./chat-provider";
import { suggestMeals } from "./demo-provider";

function input(message: string): ChatMealsRequest {
  const { pantry, preferences } = createSampleHousehold();
  return {
    pantry,
    preferences,
    meals: [],
    recipeBox: [],
    messages: [],
    message,
  };
}

const riceRecipe = (id = "rice-meal"): Recipe => ({
  id,
  name: "Rice meal",
  description: "A recipe for testing quantities.",
  servings: 2,
  minutes: 30,
  ingredients: [
    { ingredientId: "rice", name: "Rice", quantity: 150, unit: "g" },
  ],
  steps: ["Cook the rice.", "Serve warm."],
});

test("demo chat returns the same validated recipe proposals as suggestions", async () => {
  const request = input("What can I make tonight?");
  const before = structuredClone(request);
  const result = await chatAboutMeals(request);
  assert.equal(chatMealsResponseSchema.safeParse(result).success, true);
  assert.equal(result.source, "demo");
  assert.equal(result.servings, request.preferences.servings);
  assert.deepEqual(result.recipes, (await suggestMeals(request)).recipes);
  assert.match(result.reply, /2 servings and up to 30 minutes/);
  assert.match(result.reply, /calendar draft/);
  assert.deepEqual(request, before);
});

test("use-soon proposals require positive pantry stock with matching IDs and units", async () => {
  const request = input("Use my use-soon ingredients");
  request.pantry = request.pantry.map((item) => ({
    ...item,
    useSoon: ["tomatoes", "zucchini"].includes(item.id),
    quantity: item.id === "zucchini" ? 0 : item.quantity,
    unit: item.id === "tomatoes" ? "ml" : item.unit,
  }));
  assert.deepEqual((await chatAboutMeals(request)).recipes, []);
  request.pantry.find((item) => item.id === "tomatoes")!.unit = "g";
  assert.deepEqual(
    (await chatAboutMeals(request)).recipes.map((recipe) => recipe.id),
    ["r1"],
  );
});

test("quicker suggestions are strictly quicker and respect the current time limit", async () => {
  const request = input("Find a quicker meal");
  const result = await chatAboutMeals(request);
  assert.equal(result.recipes.length, 2);
  assert.ok(result.recipes.every((recipe) => recipe.minutes < 30));
  request.focusedRecipe = { ...riceRecipe(), minutes: 25 };
  assert.deepEqual((await chatAboutMeals(request)).recipes, []);
  request.focusedRecipe = riceRecipe();
  request.preferences.maxMinutes = 10;
  assert.deepEqual((await chatAboutMeals(request)).recipes, []);
});

test("plan review scales meals and subtracts combined pantry stock only once", async () => {
  const request = input("Review my plan");
  request.pantry = [
    {
      id: "rice",
      name: "Rice",
      quantity: 200,
      unit: "g",
      location: "Cupboard",
      useSoon: false,
      tag: "special",
    },
  ];
  request.meals = [
    { id: "one", recipe: riceRecipe(), servings: 4 },
    { id: "two", recipe: riceRecipe(), servings: 2 },
  ];
  const before = structuredClone(request);
  const result = await chatAboutMeals(request);
  assert.match(result.reply, /250 g Rice/);
  assert.match(result.reply, /counting pantry stock once/);
  assert.match(result.reply, /calendar preview/);
  assert.match(result.reply, /Commit your calendar to update the grocery list/);
  assert.deepEqual(result.recipes, []);
  assert.deepEqual(request, before);
});

test("focused recipe gaps match ingredient ID and unit and scale current servings", async () => {
  const request = input("What do I need for this recipe?");
  request.focusedRecipe = riceRecipe();
  request.preferences.servings = 4;
  request.pantry = [
    {
      id: "rice",
      name: "Rice",
      quantity: 1000,
      unit: "ml",
      location: "Cupboard",
      useSoon: false,
      tag: "special",
    },
    {
      id: "beans",
      name: "Rice",
      quantity: 1000,
      unit: "g",
      location: "Cupboard",
      useSoon: false,
      tag: "special",
    },
    {
      id: "rice",
      name: "Rice",
      quantity: 100,
      unit: "g",
      location: "Cupboard",
      useSoon: false,
      tag: "special",
    },
  ];
  const result = await chatAboutMeals(request);
  assert.match(result.reply, /4 servings/);
  assert.match(result.reply, /200 g Rice/);
  assert.match(result.reply, /this recipe on its own/);
  assert.match(result.reply, /only committed meals/);
  assert.deepEqual(result.recipes, [request.focusedRecipe]);
});

test("demo focused coverage excludes staple restocks that remain in full plan review", async () => {
  const request = input("What do I need for this recipe?");
  request.focusedRecipe = riceRecipe();
  request.focusedServings = 2;
  request.pantry = [
    { id: "rice", name: "Rice", quantity: 200, unit: "g", location: "Cupboard", useSoon: false, tag: "staple", restockBelow: 500 },
    { id: "salt", name: "Salt", quantity: 0, unit: "g", location: "Cupboard", useSoon: false, tag: "staple", restockBelow: 50 },
  ];
  assert.match((await chatAboutMeals(request)).reply, /pantry covers all the ingredient amounts/);
  request.message = "Review my plan";
  request.meals = [{ id: "planned", recipe: riceRecipe(), servings: 2 }];
  const review = await chatAboutMeals(request);
  assert.match(review.reply, /300 g Rice \(staple restock\)/);
  assert.match(review.reply, /50 g Salt \(staple restock\)/);
});

test("focused steps return original recipe details with bounded readable text", async () => {
  const request = input("How do I cook this?");
  assert.match((await chatAboutMeals(request)).reply, /Choose Discuss/);
  request.focusedRecipe = {
    ...riceRecipe(),
    steps: Array.from({ length: 20 }, () => "Cook carefully. ".repeat(60)),
  };
  const result = await chatAboutMeals(request);
  assert.ok(result.reply.length <= 2000);
  assert.match(result.reply, /complete instructions/);
  assert.deepEqual(result.recipes, [request.focusedRecipe]);
});

test("focused discussions retain the selected recipe servings after preferences change", async () => {
  const request = input("What do I need for this recipe?");
  request.focusedRecipe = riceRecipe();
  request.focusedServings = 4;
  request.preferences.servings = 1;
  request.pantry = [];
  const result = await chatAboutMeals(request);
  assert.match(result.reply, /4 servings/);
  assert.match(result.reply, /300 g Rice/);
  assert.equal(result.servings, 4);
  request.message = "How do I cook this recipe?";
  const steps = await chatAboutMeals(request);
  assert.match(steps.reply, /4 servings/);
  assert.equal(steps.servings, 4);
});

test("ordinary proposals use preferences even while discussing a differently portioned recipe", async () => {
  for (const message of [
    "What can I make tonight?",
    "Find a quicker meal",
    "Recipes with rice",
    "Use my use-soon ingredients",
  ]) {
    const request = input(message);
    request.focusedRecipe = riceRecipe();
    request.focusedServings = 8;
    request.preferences.servings = 3;
    const result = await chatAboutMeals(request);
    assert.ok(result.recipes.length > 0, message);
    assert.equal(result.servings, 3, message);
    assert.match(result.reply, /3 servings/, message);
    assert.ok(
      result.recipes.every((recipe) => recipe.servings === 2),
      message,
    );
  }
});

test("specific ingredient searches use the complete phrase and preserve recipe quantities", async () => {
  const request = input("Recipes with tomatoes");
  const result = await chatAboutMeals(request);
  assert.deepEqual(
    result.recipes.map((recipe) => recipe.id),
    ["r1"],
  );
  assert.equal(result.recipes[0].servings, 2);
  assert.equal(result.recipes[0].ingredients[0].quantity, 400);
  request.message = "Recipes with tomatoes but no rice";
  assert.deepEqual((await chatAboutMeals(request)).recipes, []);
});

test("unsupported constraints and autonomous changes receive an honest fallback", async () => {
  for (const message of [
    "What can I make tonight without dairy?",
    "Find a quicker meal that is gluten-free",
    "Give me vegan recipes",
    "I am allergic to rice. What can I make tonight?",
    "Recipes with rice for 8",
    "Use my use-soon ingredients but no tomatoes",
    "Suggest Italian meals",
    "Add all these recipes to my plan",
    "Remove my first meal",
    "Something completely different",
  ]) {
    const request = input(message);
    const before = structuredClone(request);
    const result = await chatAboutMeals(request);
    assert.deepEqual(result.recipes, [], message);
    assert.match(result.reply, /haven’t applied those constraints/, message);
    assert.deepEqual(request, before);
  }
});

test("empty plans, empty results, and invalid empty messages have explicit outcomes", async () => {
  const emptyReview = await chatAboutMeals(input("Review my plan"));
  assert.match(emptyReview.reply, /calendar is empty/);
  assert.match(emptyReview.reply, /Add to calendar/);
  const request = input("What can I make tonight?");
  request.preferences.maxMinutes = 10;
  const result = await chatAboutMeals(request);
  assert.deepEqual(result.recipes, []);
  assert.match(result.reply, /No sample recipes/);
  await assert.rejects(() => chatAboutMeals(input("  ")));
});

test("demo chat uses current explicit corrections for this answer without saving them", async () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  const actor = state.pilot.members[0].id;
  state.pilot.session.memberIds = [actor];
  const value: ProfileFactValue = { kind: "food-dislike", scope: { kind: "member", memberId: actor },
    target: { kind: "ingredient", ingredientId: "tomatoes", name: "Tomatoes" }, disliked: true };
  state.pilot.profileFacts = [{ id: profileFactId(value), value,
    source: { kind: "manual", sourceText: "I dislike tomatoes", recordedAt: "2026-10-12T00:00:00.000Z", commandId: "setup" } }];
  const request = { ...input("What can I make tonight?"), recommendationContext: buildRecommendationContext(state, actor) };
  assert.ok(!(await chatAboutMeals(request)).recipes.some((recipe) => recipe.id === "r1"));
  request.message = "I no longer dislike tomatoes. What can I make tonight?";
  const before = structuredClone(request);
  const result = await chatAboutMeals(request);
  assert.ok(result.recipes.some((recipe) => recipe.id === "r1"));
  assert.match(result.reply, /for this answer/);
  assert.deepEqual(request, before);
  request.message = "What can I make tonight?";
  assert.ok(!(await chatAboutMeals(request)).recipes.some((recipe) => recipe.id === "r1"));
  request.message = "No tomatoes tonight. What can I make tonight?";
  assert.deepEqual((await chatAboutMeals(request)).recipes, []);
  assert.match((await chatAboutMeals(request)).reply, /haven’t applied those constraints/);
});

test("demo chat reports qualitative stock checks without reusing historical quantities", async () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  state.pilot.stock = [{ ingredientId: "rice", name: "Rice", unit: "g", status: "low" }];
  const request = { ...input("What do I need for this recipe?"), focusedRecipe: riceRecipe(), recommendationContext: buildRecommendationContext(state) };
  const before = structuredClone(request);
  const result = await chatAboutMeals(request);
  assert.match(result.reply, /Check the current amount of Rice/);
  assert.match(result.reply, /quantity is unknown/);
  assert.doesNotMatch(result.reply, /pantry covers all|150 g Rice/);
  request.message = "Review my plan";
  request.meals = [{ id: "one", recipe: riceRecipe(), servings: 2 }];
  assert.match((await chatAboutMeals(request)).reply, /Check the current amount of Rice/);
  assert.deepEqual({ ...request, message: before.message, meals: before.meals }, before);
});

test("demo chat keeps package counts as unresolved contents", async () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  state.pantry = state.pantry.filter((item) => item.id !== "beans");
  state.pilot.packageStock = [{ ingredientId: "beans", name: "Canned white beans", packageKind: "can", status: "exact", count: 10 }];
  const request = { ...input("What do I need for this recipe?"),
    focusedRecipe: { ...riceRecipe(), ingredients: [{ ingredientId: "beans", name: "Beans", quantity: 200, unit: "g" as const }] },
    recommendationContext: buildRecommendationContext(state) };
  const result = await chatAboutMeals(request);
  assert.match(result.reply, /Check the current amount of Beans/);
  assert.doesNotMatch(result.reply, /200 g Beans|10 g|pantry covers all/);
});

test("ingredient search explains when the saved profile excludes every authored example", async () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  const value: ProfileFactValue = { kind: "food-dislike", scope: { kind: "household" }, target: { kind: "category", category: "vegetables" }, disliked: true };
  state.pilot.profileFacts = [{ id: profileFactId(value), value,
    source: { kind: "manual", sourceText: "We dislike vegetables", recordedAt: "2026-10-12T00:00:00.000Z", commandId: "setup" } }];
  const request = { ...input("Recipes with rice"), recommendationContext: buildRecommendationContext(state) };
  const before = structuredClone(request);
  const result = await chatAboutMeals(request);
  assert.deepEqual(result.recipes, []);
  assert.match(result.reply, /No sample recipes fit the current food preferences/);
  assert.doesNotMatch(result.reply, /haven’t applied those constraints/);
  assert.deepEqual(request, before);
});
