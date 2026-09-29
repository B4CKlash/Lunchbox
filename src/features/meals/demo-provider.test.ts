import assert from "node:assert/strict";
import test from "node:test";
import { suggestMealsResponseSchema } from "@/lib/contracts";
import { createSampleHousehold } from "@/features/pantry/seed";
import { suggestMeals } from "./demo-provider";

test("sample provider returns structured recipes and prioritizes available use-soon ingredients", async () => {
  const response = await suggestMeals(createSampleHousehold());
  assert.equal(suggestMealsResponseSchema.safeParse(response).success, true);
  assert.equal(response.source, "demo");
  assert.deepEqual(
    response.recipes.map((recipe) => recipe.id),
    ["r2", "r1", "r3"],
  );
});

test("time preference filters suggestions, including an empty result", async () => {
  const input = createSampleHousehold();
  input.preferences.maxMinutes = 25;
  assert.deepEqual(
    (await suggestMeals(input)).recipes.map((recipe) => recipe.id),
    ["r1", "r3"],
  );
  input.preferences.maxMinutes = 10;
  assert.deepEqual((await suggestMeals(input)).recipes, []);
});

test("coverage takes priority when use-soon is disabled and accounts for quantities", async () => {
  const input = createSampleHousehold();
  input.preferences.prioritizeUseSoon = false;
  assert.equal((await suggestMeals(input)).recipes[0].id, "r3");
  input.pantry = input.pantry.map((item) => ({
    ...item,
    quantity: ["zucchini", "pepper", "beans", "lemon"].includes(item.id)
      ? 1000
      : 0,
  }));
  assert.equal((await suggestMeals(input)).recipes[0].id, "r2");
});

test("zero stock and mismatched units cannot boost use-soon ranking", async () => {
  const input = createSampleHousehold();
  input.pantry = input.pantry.map((item) => ({
    ...item,
    useSoon: item.id === "tomatoes" || item.id === "zucchini",
    quantity: item.id === "zucchini" ? 0 : item.quantity,
    unit: item.id === "tomatoes" ? "ml" : item.unit,
  }));
  assert.equal((await suggestMeals(input)).recipes[0].id, "r3");
});

test("callers cannot mutate the provider's recipes and requests stay unchanged", async () => {
  const input = createSampleHousehold();
  const before = structuredClone(input);
  const first = await suggestMeals(input);
  first.recipes[0].ingredients[0].quantity = 999;
  assert.notEqual(
    (await suggestMeals(input)).recipes[0].ingredients[0].quantity,
    999,
  );
  assert.deepEqual(input, before);
});

test("onboarding preferences personalize ranking and allergy exclusions", async () => {
  const input = createSampleHousehold();
  input.preferences.goals = ["meal-prep"];
  input.preferences.nutritionFocus = ["high-protein"];
  input.preferences.flavorPreferences = ["rich-comforting"];
  input.preferences.cuisinePreferences = ["american-comfort"];
  input.preferences.cookingStyles = ["big-batch", "meal-prep"];
  assert.equal((await suggestMeals(input)).recipes[0].id, "r3");

  input.preferences.allergies = ["rice"];
  assert.deepEqual((await suggestMeals(input)).recipes, []);
});

test("ingredient dislikes are excluded separately from strict allergies", async () => {
  const input = createSampleHousehold();
  input.preferences.dislikedIngredients = ["tomatoes"];
  assert.equal(
    (await suggestMeals(input)).recipes.some((recipe) => recipe.id === "r1"),
    false,
  );
});

test("flavor and cuisine preferences influence recommendation ranking", async () => {
  const input = createSampleHousehold();
  input.preferences.flavorPreferences = ["spicy"];
  input.preferences.cuisinePreferences = ["mexican"];
  assert.equal((await suggestMeals(input)).recipes[0].id, "r2");
});

test("pescatarian and flexitarian preferences remain compatible with plant-based recipes", async () => {
  const input = createSampleHousehold();
  input.preferences.dietaryNeeds = ["pescatarian", "flexitarian"];
  assert.equal((await suggestMeals(input)).recipes.length, 3);
});
