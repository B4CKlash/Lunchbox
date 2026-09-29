import assert from "node:assert/strict";
import test from "node:test";
import { rememberRecipeNames } from "./suggestion-history";

test("successful suggestions retain previous dishes for later generation requests", () => {
  const previous = ["Lentil soup", "Rice bowl"];
  const recipes = [{ name: "Chickpea salad" }, { name: "Tomato pasta" }];
  assert.deepEqual(rememberRecipeNames(previous, recipes), [
    "Lentil soup", "Rice bowl", "Chickpea salad", "Tomato pasta",
  ]);
  assert.deepEqual(previous, ["Lentil soup", "Rice bowl"]);
  assert.deepEqual(rememberRecipeNames(previous, []), previous);
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
