import assert from "node:assert/strict";
import test from "node:test";
import { knownIngredientsFromHousehold, resolveIngredient } from "./ingredients";
import { createSampleHousehold } from "./seed";
import { buildShoppingList } from "../planning/shopping";
import type { Recipe } from "@/lib/contracts";

test("authored aliases reuse stock IDs but cooked/dry forms remain distinct", () => {
  const known = knownIngredientsFromHousehold(createSampleHousehold());
  const tomato = resolveIngredient({ name: "tomatoes", unit: "g" }, known);
  assert.equal(tomato.status === "resolved" && tomato.ingredient.ingredientId, "tomatoes");
  const cooked = resolveIngredient({ name: "Cooked lentils", unit: "g" }, known);
  const dry = resolveIngredient({ name: "Dry lentils", unit: "g" }, known);
  assert.equal(cooked.status === "resolved" && cooked.ingredient.ingredientId, "lentils");
  assert.equal(dry.status === "resolved" && dry.ingredient.ingredientId, "dry-lentils");
});

test("unknown ingredients have stable normalized IDs independent of units", () => {
  const a = resolveIngredient({ name: "Aji amarillo paste", unit: "g" });
  const b = resolveIngredient({ name: "  AJI  AMARILLO PASTE ", unit: "ml" });
  assert.equal(a.status === "resolved" && a.ingredient.ingredientId, b.status === "resolved" && b.ingredient.ingredientId);
  if (a.status === "resolved" && b.status === "resolved") assert.notEqual(a.ingredient.unit, b.ingredient.unit);
});

test("draft calendar recipe identities are reusable before committing groceries", () => {
  const state = createSampleHousehold();
  state.workspace.calendar.draft = [{ id: "draft-1", servings: 2, recipe: {
    id: "favorite-1", name: "Family dish", description: "", servings: 2, minutes: 20,
    ingredients: [{ ingredientId: "legacy-family-paste", name: "Family paste", quantity: 25, unit: "g" }],
    steps: ["Cook."],
  } }];
  const match = resolveIngredient({ name: "Family paste", unit: "g" }, knownIngredientsFromHousehold(state));
  assert.equal(match.status === "resolved" && match.ingredient.ingredientId, "legacy-family-paste");
  assert.deepEqual(buildShoppingList(state.pantry, state.meals), []);
});

test("multiple legacy identities require a choice instead of merging", () => {
  const known = [
    { ingredientId: "legacy-a", name: "Tomatoes", unit: "g" as const },
    { ingredientId: "legacy-b", name: "Roma tomatoes", unit: "g" as const },
  ];
  assert.equal(resolveIngredient({ name: "Tomatoes", unit: "g" }, known).status, "ambiguous");
  const selected = resolveIngredient({ name: "Tomatoes", unit: "g", ingredientId: "legacy-b" }, known);
  assert.equal(selected.status === "resolved" && selected.ingredient.ingredientId, "legacy-b");
});

test("missing custom ingredient combines across meals and later pantry stock clears its shortage", () => {
  const item = resolveIngredient({ name: "Aji amarillo paste", unit: "g" });
  assert.equal(item.status, "resolved");
  if (item.status !== "resolved") return;
  const recipe: Recipe = { id: "a", name: "Aji bowl", description: "", servings: 2, minutes: 20,
    ingredients: [{ ...item.ingredient, quantity: 20 }], steps: ["Cook."] };
  const meals = [{ id: "m1", recipe, servings: 2 }, { id: "m2", recipe: { ...recipe, id: "b" }, servings: 4 }];
  const state = createSampleHousehold();
  state.meals = meals;
  const stocked = resolveIngredient({ name: "Aji amarillo paste", unit: "g" }, knownIngredientsFromHousehold(state));
  assert.deepEqual(stocked, item);
  assert.equal(buildShoppingList([], meals)[0].quantity, 60);
  assert.equal(buildShoppingList([{ id: item.ingredient.ingredientId, name: item.ingredient.name, quantity: 50, unit: "g", location: "Fridge", useSoon: false, tag: "special" }], meals)[0].quantity, 10);
  assert.equal(buildShoppingList([{ id: item.ingredient.ingredientId, name: item.ingredient.name, quantity: 100, unit: "ml", location: "Fridge", useSoon: false, tag: "special" }], meals)[0].quantity, 60);
});
