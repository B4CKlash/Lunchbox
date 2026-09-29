import assert from "node:assert/strict";
import test from "node:test";
import { inferPantryCategory } from "./categories";

test("infers common pantry food groups for existing saved items", () => {
  assert.equal(inferPantryCategory({ id: "eggs", name: "Eggs" }), "protein");
  assert.equal(inferPantryCategory({ id: "rice", name: "Jasmine rice" }), "carbs");
  assert.equal(inferPantryCategory({ id: "spinach", name: "Spinach" }), "vegetables");
  assert.equal(inferPantryCategory({ id: "lemon", name: "Lemon" }), "fruit");
  assert.equal(inferPantryCategory({ id: "oil", name: "Olive oil" }), "fats");
});

test("an explicit category wins and unknown ingredients remain available under other", () => {
  assert.equal(
    inferPantryCategory({ id: "avocado", name: "Avocado", category: "fats" }),
    "fats",
  );
  assert.equal(inferPantryCategory({ id: "mystery", name: "Mystery item" }), "other");
});
