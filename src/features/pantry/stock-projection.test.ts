import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, type PantryItem } from "@/lib/contracts";
import { ensurePilot } from "@/features/planning/pilot";
import { aggregatePantry, pantryForModel } from "./stock-projection";

const item: PantryItem = { id: "pasta", name: "Pasta", quantity: 900, unit: "g", location: "Cupboard", useSoon: false, tag: "special" };
const makeState = () => ensurePilot(householdStateSchema.parse({ version: 1, pantry: [item, { ...item, quantity: 100, location: "Fridge", useSoon: true }], preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true }, meals: [] }));

test("canonical stock projection aggregates legacy rows once per ingredient and unit without mutation", () => {
  const state = makeState();
  const projected = aggregatePantry([...state.pantry, { ...item, unit: "each", quantity: 2 }]);
  assert.deepEqual(projected.map((entry) => [entry.id, entry.unit, entry.quantity, entry.useSoon]), [["pasta", "g", 1000, true], ["pasta", "each", 2, false]]);
  assert.equal(pantryForModel(state.pantry)[0].quantity, 1000);
  assert.equal(state.pantry.length, 2);
  assert.equal(state.pantry[0].quantity, 900);
});

test("model projection applies one certainty override and includes stock-only ingredients", () => {
  const state = makeState();
  state.pilot.stock = [
    { ingredientId: "pasta", name: "Pasta", unit: "g", status: "some" },
    { ingredientId: "beans", name: "Beans", unit: "g", status: "low", useSoon: true },
  ];
  const projected = pantryForModel(state.pantry, state);
  assert.equal(projected.length, 2);
  assert.equal(projected[0].status, "some");
  assert.equal(projected[0].quantityKnown, false);
  assert.equal("quantity" in projected[0], false);
  assert.equal(projected[1].id, "beans");
  assert.equal(projected[1].status, "low");
  assert.equal("quantity" in projected[1], false);
  state.pilot.stock[0] = { ...state.pilot.stock[0], status: "exact", quantity: 20 };
  assert.equal(pantryForModel(state.pantry, state)[0].quantity, 20);
  state.pilot.stock[0] = { ingredientId: "pasta", name: "Pasta", unit: "g", status: "out" };
  assert.equal(pantryForModel(state.pantry, state)[0].quantity, 0);
});
