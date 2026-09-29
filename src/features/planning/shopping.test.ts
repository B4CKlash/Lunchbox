import assert from "node:assert/strict";
import test from "node:test";
import type { PantryItem, PlannedMeal, Recipe } from "@/lib/contracts";
import { buildShoppingList } from "./shopping";

const pantryItem = (
  quantity: number,
  unit: PantryItem["unit"] = "g",
): PantryItem => ({
  id: "rice",
  name: "Jasmine rice",
  quantity,
  restockBelow: 0,
  unit,
  location: "Cupboard",
  useSoon: false,
  tag: "special",
});
const recipe = (quantity: number, unit: PantryItem["unit"] = "g"): Recipe => ({
  id: "rice-meal",
  name: "Rice meal",
  description: "Test recipe",
  minutes: 20,
  servings: 2,
  ingredients: [{ ingredientId: "rice", name: "Jasmine rice", quantity, unit }],
  steps: ["Cook the rice."],
});
const meal = (
  id: string,
  quantity: number,
  servings = 2,
  unit: PantryItem["unit"] = "g",
): PlannedMeal => ({ id, recipe: recipe(quantity, unit), servings });

test("combines meal demand before subtracting pantry stock once", () => {
  assert.deepEqual(
    buildShoppingList([pantryItem(200)], [meal("one", 150), meal("two", 150)]),
    [
      {
        ingredientId: "rice",
        name: "Jasmine rice",
        unit: "g",
        required: 300,
        available: 200,
        quantity: 100,
      },
    ],
  );
});

test("scales each recipe by planned servings and merges duplicate pantry entries", () => {
  assert.deepEqual(
    buildShoppingList(
      [pantryItem(100), pantryItem(150)],
      [meal("one", 150, 4), meal("two", 100, 1)],
    ),
    [
      {
        ingredientId: "rice",
        name: "Jasmine rice",
        unit: "g",
        required: 350,
        available: 250,
        quantity: 100,
      },
    ],
  );
});

test("different units and ingredient IDs never silently share stock", () => {
  const pantry = [
    pantryItem(1000, "ml"),
    { ...pantryItem(1000), id: "beans", name: "Jasmine rice" },
  ];
  assert.deepEqual(
    buildShoppingList(pantry, [meal("one", 150), meal("two", 50, 2, "ml")]),
    [
      {
        ingredientId: "rice",
        name: "Jasmine rice",
        unit: "g",
        required: 150,
        available: 0,
        quantity: 150,
      },
    ],
  );
});

test("returns shortages only and does not change pantry or planned meals", () => {
  const pantry = [pantryItem(500)];
  const meals = [meal("one", 150)];
  const before = structuredClone({ pantry, meals });
  assert.deepEqual(buildShoppingList(pantry, meals), []);
  assert.deepEqual(buildShoppingList(pantry, []), []);
  assert.deepEqual({ pantry, meals }, before);
});

test("rounds fractional quantities without floating-point residue", () => {
  assert.deepEqual(
    buildShoppingList([pantryItem(0.1)], [meal("one", 0.2), meal("two", 0.2)]),
    [
      {
        ingredientId: "rice",
        name: "Jasmine rice",
        unit: "g",
        required: 0.4,
        available: 0.1,
        quantity: 0.3,
      },
    ],
  );
  assert.deepEqual(
    buildShoppingList([pantryItem(0.3)], [meal("one", 0.1), meal("two", 0.2)]),
    [],
  );
});

test("restocks low staple quantities to their threshold, combining recipe demand", () => {
  assert.deepEqual(
    buildShoppingList([{ ...pantryItem(40), tag: "staple", restockBelow: 100 }], [meal("one", 30)]),
    [{ ingredientId: "rice", name: "Jasmine rice", unit: "g", required: 100, available: 40, quantity: 60, restock: true }],
  );
});

test("recipe coverage excludes unrelated restocks and staple thresholds while full shopping retains them", () => {
  const pantry: PantryItem[] = [
    { ...pantryItem(40), tag: "staple", restockBelow: 100 },
    { ...pantryItem(10), id: "salt", name: "Salt", tag: "staple", restockBelow: 50 },
  ];
  const meals = [meal("one", 60)];
  const before = structuredClone({ pantry, meals });
  assert.deepEqual(buildShoppingList(pantry, meals, { includeRestock: false }), [
    { ingredientId: "rice", name: "Jasmine rice", unit: "g", required: 60, available: 40, quantity: 20 },
  ]);
  assert.deepEqual(buildShoppingList(pantry, meals), [
    { ingredientId: "rice", name: "Jasmine rice", unit: "g", required: 100, available: 40, quantity: 60, restock: true },
    { ingredientId: "salt", name: "Salt", unit: "g", required: 50, available: 10, quantity: 40, restock: true },
  ]);
  assert.deepEqual(buildShoppingList(pantry, [meal("covered", 30)], { includeRestock: false }), []);
  assert.deepEqual({ pantry, meals }, before);
});
