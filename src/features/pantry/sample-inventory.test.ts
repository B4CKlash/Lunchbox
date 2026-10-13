import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, pantryItemSchema } from "@/lib/contracts";
import { ingredientCatalog } from "./ingredients";
import { createInventoryExperiment, createSamplePantry } from "./sample-inventory";

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

test("random experiment inventories have canonical, separate measured quantities and practical variety", () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const pantry = createSamplePantry("random", seededRandom(seed));
    assert.equal(pantry.length, 19);
    assert.equal(new Set(pantry.map((item) => `${item.id}:${item.unit}`)).size, pantry.length);
    assert.ok(pantry.every((item) => pantryItemSchema.safeParse(item).success));
    assert.ok(pantry.every((item) => ingredientCatalog.some((entry) => entry.ingredientId === item.id && entry.name === item.name)));
    assert.ok(pantry.every((item) => item.quantity > 0 && (item.unit !== "each" || Number.isInteger(item.quantity))));
    assert.ok(pantry.some((item) => item.category === "protein"));
    assert.ok(pantry.some((item) => item.category === "carbs"));
    assert.ok(pantry.some((item) => item.category === "fruit"));
    assert.ok(pantry.filter((item) => item.category === "vegetables").length >= 5);
    assert.deepEqual(pantry.find((item) => item.id === "oil")?.unit, "ml");
    assert.deepEqual(pantry.find((item) => item.id === "onion")?.unit, "each");
  }
});

test("randomized inventory explores different ingredients and quantities without shared mutable data", () => {
  const first = createSamplePantry("random", seededRandom(1));
  const same = createSamplePantry("random", seededRandom(1));
  const another = createSamplePantry("random", seededRandom(2));
  assert.deepEqual(first, same);
  assert.notDeepEqual(first, another);
  first[0].quantity = 0;
  assert.ok(same[0].quantity > 0);
  const sample = createSamplePantry();
  sample[0].quantity = 0;
  assert.equal(createSamplePantry()[0].quantity, 800);
});

test("experiment kitchens use the existing household schema without historical records or fabricated package conversions", () => {
  for (const randomized of [false, true]) {
    const household = createInventoryExperiment(randomized, seededRandom(1));
    assert.ok(householdStateSchema.safeParse(household).success);
    assert.equal(household.preferences.onboardingComplete, true);
    assert.deepEqual(household.meals, []);
    assert.deepEqual(household.workspace.recipeBox, []);
    assert.deepEqual(household.pilot?.batches, []);
    assert.deepEqual(household.pilot?.purchaseLots, []);
    assert.deepEqual(household.pilot?.packageStock, []);
    assert.deepEqual(household.pilot?.packagePurchases, []);
    assert.deepEqual(household.pilot?.profileFacts, []);
    assert.deepEqual(household.pilot?.receipts, []);
  }
});
