import assert from "node:assert/strict";
import test from "node:test";
import { suggestMealsResponseSchema, type ProfileFactValue } from "@/lib/contracts";
import { createSampleHousehold } from "@/features/pantry/seed";
import { ensurePilot } from "@/features/planning/pilot";
import { profileFactId } from "@/features/planning/profile";
import { buildRecommendationContext } from "./recommendation-context";
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

function withFacts(...values: ProfileFactValue[]) {
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  state.pilot.profileFacts = values.map((value) => ({ id: profileFactId(value), value,
    source: { kind: "manual", sourceText: "Authored preference", recordedAt: "2026-10-12T00:00:00.000Z", commandId: "setup" } }));
  return state;
}

test("demo recommendations apply typed dislikes only to the selected people", async () => {
  const state = withFacts();
  const [first, second] = state.pilot.members;
  state.pilot.session.memberIds = [first.id];
  const value: ProfileFactValue = { kind: "food-dislike", scope: { kind: "member", memberId: second.id },
    target: { kind: "ingredient", ingredientId: "tomatoes", name: "Tomatoes" }, disliked: true };
  state.pilot.profileFacts = withFacts(value).pilot.profileFacts;
  assert.ok((await suggestMeals({ ...state, recommendationContext: buildRecommendationContext(state, first.id) })).recipes.some((recipe) => recipe.id === "r1"));
  state.pilot.session.memberIds.push(second.id);
  assert.ok(!(await suggestMeals({ ...state, recommendationContext: buildRecommendationContext(state, first.id) })).recipes.some((recipe) => recipe.id === "r1"));
  state.pilot.profileFacts = withFacts({ kind: "food-dislike", scope: { kind: "household" }, target: { kind: "category", category: "vegetables" }, disliked: true }).pilot.profileFacts;
  assert.deepEqual((await suggestMeals({ ...state, recommendationContext: buildRecommendationContext(state, first.id) })).recipes, []);
});

test("typed corrections override only the same scope's legacy dislike and retain allergies", async () => {
  const state = withFacts({ kind: "food-dislike", scope: { kind: "household" },
    target: { kind: "ingredient", ingredientId: "tomatoes", name: "Tomatoes" }, disliked: false });
  state.preferences.dislikedIngredients = ["tomatoes"];
  assert.ok((await suggestMeals({ ...state, recommendationContext: buildRecommendationContext(state) })).recipes.some((recipe) => recipe.id === "r1"));
  state.preferences.allergies = ["tomatoes"];
  assert.ok(!(await suggestMeals({ ...state, recommendationContext: buildRecommendationContext(state) })).recipes.some((recipe) => recipe.id === "r1"));
  state.preferences.allergies = [];
  state.pilot.profileFacts[0].value = { ...state.pilot.profileFacts[0].value, scope: { kind: "member", memberId: state.pilot.members[0].id } } as ProfileFactValue;
  assert.ok(!(await suggestMeals({ ...state, recommendationContext: buildRecommendationContext(state) })).recipes.some((recipe) => recipe.id === "r1"));
});

test("demo excludes unavailable oven recipes but leaves unknown equipment eligible", async () => {
  const state = withFacts({ kind: "equipment", equipment: "oven", availability: "unavailable" });
  assert.ok(!(await suggestMeals({ ...state, recommendationContext: buildRecommendationContext(state) })).recipes.some((recipe) => recipe.id === "r2"));
  state.pilot.profileFacts = withFacts({ kind: "equipment", equipment: "oven", availability: "unknown" }).pilot.profileFacts;
  assert.ok((await suggestMeals({ ...state, recommendationContext: buildRecommendationContext(state) })).recipes.some((recipe) => recipe.id === "r2"));
});

test("current stock projection replaces historical quantities in demo ranking", async () => {
  const state = withFacts();
  state.pantry = state.pantry.map((item) => ({ ...item, useSoon: item.id === "tomatoes" }));
  assert.equal((await suggestMeals(state)).recipes[0].id, "r1");
  state.pilot.stock = [{ ingredientId: "tomatoes", name: "Tomatoes", unit: "g", status: "some", useSoon: true }];
  const before = structuredClone(state);
  assert.equal((await suggestMeals({ ...state, recommendationContext: buildRecommendationContext(state) })).recipes[0].id, "r3");
  assert.deepEqual(state, before);
});
