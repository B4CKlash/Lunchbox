import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "./seed";
import { pantryStockDisplay } from "./stock-display";

test("qualitative pantry display never exposes the historical exact balance", () => {
  const item = createSampleHousehold().pantry[0];
  assert.equal(item.quantity, 800);
  for (const status of ["some", "low"] as const) {
    const display = pantryStockDisplay(item, [{ ingredientId: item.id, name: item.name, unit: item.unit, status }]);
    assert.equal(display.quantity, null);
    assert.equal(display.onHand, true);
    assert.doesNotMatch(display.label, /800/);
    assert.match(display.label, /unknown/);
  }
});

test("out overrides old quantity and exact confirmations use the measured amount", () => {
  const item = createSampleHousehold().pantry[0];
  assert.equal(pantryStockDisplay(item, [{ ingredientId: item.id, name: item.name, unit: item.unit, status: "out" }]).onHand, false);
  const display = pantryStockDisplay(item, [{ ingredientId: item.id, name: item.name, unit: item.unit, status: "exact", quantity: 20, useSoon: false }]);
  assert.equal(display.quantity, 20);
  assert.equal(display.label, "20 g");
  assert.equal(display.useSoon, false);
});

test("qualitative overrides match both canonical ingredient identity and unit", () => {
  const item = createSampleHousehold().pantry[0];
  assert.equal(pantryStockDisplay(item, [{ ingredientId: item.id, name: item.name, unit: "ml", status: "some" }]).quantity, 800);
});
