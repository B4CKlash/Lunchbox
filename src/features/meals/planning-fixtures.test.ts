import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "@/features/pantry/seed";
import { recipeSchema, type ProfileFactValue } from "@/lib/contracts";
import { ensurePilot } from "@/features/planning/pilot";
import { profileFactId } from "@/features/planning/profile";
import { findPlanningFavorites, fixtureRecipeForRequest, planningFixtureRecipe } from "./planning-fixtures";

test("fixture variants remain validated demo recipes with canonical identities", () => {
  const state = createSampleHousehold();
  for (const variant of ["pasta", "vegetables", "quick", "cuisine"] as const) {
    const recipe = planningFixtureRecipe(state, variant);
    assert.equal(recipeSchema.safeParse(recipe).success, true);
    assert.equal(recipe.provenance?.source, "demo");
    assert.ok(recipe.ingredients.some((item) => item.ingredientId === "tomatoes" && item.unit === "g"));
  }
  assert.ok(planningFixtureRecipe(state, "quick").minutes < planningFixtureRecipe(state).minutes);
});

test("favorite retrieval does not invent household preferences or mutate state", () => {
  const state = createSampleHousehold();
  const before = structuredClone(state);
  assert.deepEqual(findPlanningFavorites(state), []);
  assert.match(fixtureRecipeForRequest(state, "find a favorite").reply, /empty/);
  assert.deepEqual(state, before);
  const recipe = planningFixtureRecipe(state);
  state.workspace.recipeBox.push({ recipe, source: "demo" });
  assert.deepEqual(findPlanningFavorites(state), [recipe]);
});

test("requests for new and revised ideas honestly identify fixture origin", () => {
  const state = createSampleHousehold();
  for (const text of ["use my vegetables", "make it quicker", "change cuisine", "pasta"]) {
    const result = fixtureRecipeForRequest(state, text);
    assert.match(result.reply, /fixture, not a generated recipe/);
    assert.equal(result.recipes.length, 1);
  }
});

test("latest feedback influences favorite retrieval without changing planned meals", () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-08");
  const pasta = planningFixtureRecipe(state);
  const vegetables = planningFixtureRecipe(state, "vegetables");
  state.workspace.recipeBox = [{ recipe: pasta, source: "demo" }, { recipe: vegetables, source: "demo" }];
  state.pilot.feedback = [{ id: "rating", recipeId: pasta.id, rating: 2, makeAgain: false, notes: "Too much effort" }];
  assert.deepEqual(findPlanningFavorites(state).map((recipe) => recipe.id), [vegetables.id]);
  assert.deepEqual(state.pilot.batches, []);
});

test("session rejections exclude saved and make-again recipes without losing their history", () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-08");
  const pasta = planningFixtureRecipe(state);
  const vegetables = planningFixtureRecipe(state, "vegetables");
  state.workspace.recipeBox = [{ recipe: pasta, source: "demo" }, { recipe: vegetables, source: "demo" }];
  state.pilot.batches = [{ id: "previous-batch", recipe: pasta, prepareDate: "2026-10-08", yield: 2, reservedExtra: 2, status: "planned" }];
  state.pilot.feedback = [{ id: "rating", recipeId: pasta.id, rating: 5, makeAgain: true, notes: "Loved it last week" }];
  state.pilot.session.rejectedRecipeIds = [pasta.id];
  const before = structuredClone(state);
  assert.deepEqual(findPlanningFavorites(state), [vegetables]);
  assert.deepEqual(fixtureRecipeForRequest(state, "find our favorites").recipes, [vegetables]);
  assert.deepEqual(fixtureRecipeForRequest(state, "pasta").recipes, []);
  assert.match(fixtureRecipeForRequest(state, "pasta").reply, /ruled out/);
  assert.deepEqual(state, before);
});

test("fixtures honor typed food and equipment facts while retaining original saved snapshots", () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  const original = planningFixtureRecipe(state);
  state.workspace.recipeBox = [{ recipe: original, source: "demo" }];
  const fact = (value: ProfileFactValue) => ({ id: profileFactId(value), value,
    source: { kind: "manual" as const, sourceText: "Current preference", recordedAt: "2026-10-12T00:00:00.000Z", commandId: "setup" } });
  state.pilot.profileFacts = [fact({ kind: "equipment", equipment: "oven", availability: "unavailable" })];
  assert.deepEqual(fixtureRecipeForRequest(state, "pasta").recipes, []);
  assert.match(fixtureRecipeForRequest(state, "pasta").reply, /does not fit/);
  assert.equal(fixtureRecipeForRequest(state, "make it quicker").recipes.length, 1);
  assert.deepEqual(findPlanningFavorites(state), [original]);
  assert.deepEqual(fixtureRecipeForRequest(state, "find a favorite").recipes, []);
  state.pilot.profileFacts = [fact({ kind: "food-dislike", scope: { kind: "household" }, target: { kind: "category", category: "vegetables" }, disliked: true })];
  assert.deepEqual(fixtureRecipeForRequest(state, "make it quicker").recipes, []);
  assert.deepEqual(state.workspace.recipeBox[0].recipe, original);
});
