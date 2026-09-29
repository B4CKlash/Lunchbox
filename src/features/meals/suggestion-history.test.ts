import assert from "node:assert/strict";
import test from "node:test";
import type { PantryItem } from "@/lib/contracts";
import { pendingPantryIngredients, rememberRecipeNames } from "./suggestion-history";

test("successful suggestions retain previous dishes for later generation requests", () => {
  const previous = ["Lentil soup", "Rice bowl"];
  const recipes = [{ name: "Chickpea salad" }, { name: "Tomato pasta" }];
  assert.deepEqual(rememberRecipeNames(previous, recipes), [
    "Lentil soup", "Rice bowl", "Chickpea salad", "Tomato pasta",
  ]);
  assert.deepEqual(previous, ["Lentil soup", "Rice bowl"]);
  assert.deepEqual(rememberRecipeNames(previous, []), previous);
});

test("new and restocked pantry items get priority, with units and depleted stock respected", () => {
  const apple: PantryItem = { id: "apples", name: "Apple", quantity: 1, unit: "each", location: "Fridge", useSoon: false, tag: "special" };
  const rice: PantryItem = { id: "rice", name: "Rice", quantity: 100, unit: "g", location: "Cupboard", useSoon: false, tag: "staple" };
  const appleRef = { ingredientId: "apples", name: "Apple", unit: "each" as const };
  assert.deepEqual(pendingPantryIngredients([rice], [rice, apple], []), [appleRef]);
  assert.deepEqual(pendingPantryIngredients([apple], [{ ...apple, quantity: 2 }], []), [appleRef]);
  assert.deepEqual(pendingPantryIngredients([apple], [{ ...apple, quantity: 0 }], [appleRef]), []);
  assert.deepEqual(pendingPantryIngredients([apple], [], [appleRef]), []);
  assert.deepEqual(pendingPantryIngredients([apple], [{ ...apple, unit: "g", quantity: 100 }], [appleRef]), [{ ...appleRef, unit: "g" }]);
  // Moving stock between rows with the same canonical pair is not a restock.
  assert.deepEqual(pendingPantryIngredients([rice, { ...rice, quantity: 50 }], [{ ...rice, quantity: 150 }], []), []);
});

test("repeat names count once and renew their place in the bounded history", () => {
  const previous = Array.from({ length: 30 }, (_, index) => `Recipe ${index + 1}`);
  const result = rememberRecipeNames(previous, [
    { name: " recipe 1 " },
    { name: "Recipe 31" },
    { name: "Recipe 32" },
  ]);
  assert.equal(result.length, 30);
  assert.equal(result[0], "Recipe 4");
  assert.deepEqual(result.slice(-3), ["recipe 1", "Recipe 31", "Recipe 32"]);
  assert.equal(result.filter((name) => name.toLowerCase() === "recipe 1").length, 1);
  assert.equal(previous.length, 30);
});
