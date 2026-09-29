import assert from "node:assert/strict";
import test from "node:test";
import { chatMealsResponseSchema, recipeSchema, type Recipe } from "./contracts";
import { createSampleHousehold } from "@/features/pantry/seed";
import { applyHouseholdAction } from "@/features/meals/workspace-state";
import { loadHousehold, saveHousehold } from "@/features/pantry/storage";

const imported: Recipe = {
  id: "import-1", name: "Tomato pasta", description: "Family favorite", servings: 2, minutes: 20,
  ingredients: [{ ingredientId: "pasta", name: "Dry pasta", quantity: 200, unit: "g" }],
  steps: ["Cook pasta."],
  provenance: { source: "import", method: "url", sourceUrl: "https://example.com/recipe", title: "Original recipe", author: "Recipe author" },
};

test("import attribution survives save, discuss, plan, and storage without changing stock", () => {
  const initial = createSampleHousehold();
  let state = applyHouseholdAction(initial, { type: "saveRecipe", recipe: imported, source: "import" });
  state = applyHouseholdAction(state, { type: "discussRecipe", recipe: imported, servings: 4 });
  state = applyHouseholdAction(state, { type: "addMeal", id: "meal", recipe: imported, servings: 4 });
  let stored = "";
  saveHousehold({ setItem: (_key, value) => { stored = value; } }, state);
  const loaded = loadHousehold({ getItem: () => stored });
  assert.ok(loaded);
  assert.deepEqual(loaded.workspace.recipeBox[0].recipe.provenance, imported.provenance);
  assert.deepEqual(loaded.workspace.focusedRecipe?.provenance, imported.provenance);
  assert.deepEqual(loaded.meals[0].recipe.provenance, imported.provenance);
  assert.equal(loaded.workspace.recipeBox[0].source, "import");
  assert.deepEqual(loaded.pantry, initial.pantry);
  imported.ingredients[0].quantity = 201;
  assert.equal(loaded.meals[0].recipe.ingredients[0].quantity, 200);
});

test("assistant source remains demo or ai even when returning imported favorites", () => {
  assert.equal(chatMealsResponseSchema.safeParse({ source: "import", reply: "Found it", recipes: [imported], servings: 2 }).success, false);
  assert.equal(chatMealsResponseSchema.safeParse({ source: "ai", reply: "Found it", recipes: [imported], servings: 2 }).success, true);
});

test("unresolved imports cannot enter a recipe and unsafe attribution URLs are rejected", () => {
  assert.equal(recipeSchema.safeParse({ ...imported, ingredients: [{ name: "Flour", ingredientId: null, quantity: null, unit: null }] }).success, false);
  assert.equal(recipeSchema.safeParse({ ...imported, provenance: { source: "import", sourceUrl: "javascript:alert(1)" } }).success, false);
});
