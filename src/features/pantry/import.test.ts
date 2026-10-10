import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, type PantryItem } from "@/lib/contracts";
import { applyPilotCommand, ensurePilot } from "@/features/planning/pilot";
import { applyPantryImport, PantryImportError, preparePantryImport, resolvePantryImportRow } from "./import";

const defaults = { quantity: 5, unit: "g" as const, location: "Cupboard" as const, tag: "special" as const };
const stock = (): PantryItem[] => [
  { id: "legacy-tomatoes", name: "Roma tomatoes", quantity: 100, unit: "g", location: "Fridge", useSoon: true, tag: "seasonal", category: "vegetables", restockBelow: 20 },
  { id: "legacy-tomatoes", name: "Roma tomatoes", quantity: 3, unit: "each", location: "Garden", useSoon: false, tag: "staple", restockBelow: 1 },
];
const known = (pantry: PantryItem[]) => pantry.map((item) => ({ ingredientId: item.id, name: item.name, unit: item.unit }));
const household = (pantry = stock()) => ensurePilot(householdStateSchema.parse({ version: 1, pantry, preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true }, meals: [] }));

test("list totals replace all matching rows while an explicit purchase adds to their combined stock", () => {
  const pantry = [...stock(), { ...stock()[0], quantity: 50 }];
  const rows = preparePantryImport("Tomatoes", "list", defaults, pantry, known(pantry));
  assert.equal(rows[0].ingredientId, "legacy-tomatoes");
  assert.equal(rows[0].intent, "set-total");
  assert.equal(rows[0].tag, "seasonal");
  const reviewed = applyPantryImport(pantry, rows, known(pantry));
  const command = { id: "total", expectedRevision: 0, operation: reviewed.operation };
  const total = applyPilotCommand(household(pantry), command).state;
  assert.equal(total.pantry.filter((item) => item.unit === "g").length, 1);
  assert.equal(total.pantry.find((item) => item.unit === "g")?.quantity, 5);
  assert.equal(total.pilot.stock[0].status, "exact");
  assert.equal(total.pilot.purchaseLots.length, 0);
  assert.deepEqual(total.pantry.find((item) => item.unit === "each"), stock()[1]);
  const purchase = applyPantryImport(pantry, [{ ...rows[0], intent: "add" }], known(pantry));
  const added = applyPilotCommand(household(pantry), { ...command, id: "add", operation: purchase.operation }).state;
  assert.equal(added.pantry.find((item) => item.unit === "g")?.quantity, 155);
  assert.equal(added.pilot.purchaseLots[0].quantity, 5);
  assert.equal(reviewed.updated, 1);
  assert.equal(pantry.length, 3, "review never mutates persisted stock");
});

test("receipt additions preserve uncertainty, each purchase history, and one atomic retry-safe receipt", () => {
  const original = household();
  original.pilot.stock = [{ ingredientId: "legacy-tomatoes", name: "Tomatoes", unit: "each", status: "some", sourceNote: "Opened box" }];
  const rows = preparePantryImport("2 Tomatoes $3.49\n3 Tomatoes $4.20\nTOTAL $7.69\nTax $0.00", "receipt", { ...defaults, unit: "each" }, original.pantry, known(original.pantry));
  assert.deepEqual(rows.map((row) => [row.quantity, row.intent]), [[2, "add"], [3, "add"]]);
  const reviewed = applyPantryImport(original.pantry, rows, known(original.pantry));
  const command = { id: "receipt", expectedRevision: 0, operation: reviewed.operation };
  const first = applyPilotCommand(original, command);
  assert.equal(first.state.pantry.find((item) => item.unit === "each")?.quantity, 8);
  assert.equal(first.state.pilot.stock[0].status, "some");
  assert.equal(first.state.pilot.stock[0].sourceNote, "Opened box");
  assert.deepEqual(first.state.pilot.purchaseLots.map((lot) => lot.quantity), [2, 3]);
  assert.equal(new Set(first.state.pilot.purchaseLots.map((lot) => lot.id)).size, 2);
  assert.equal(first.state.pilot.revision, 1);
  assert.equal(first.state.pilot.receipts.length, 1);
  const retry = applyPilotCommand(first.state, command);
  assert.deepEqual(retry.state, first.state);
  assert.equal(original.pilot.purchaseLots.length, 0);
});

test("ambiguous import names require one of the presented identities", () => {
  const pantry = [...stock(), { ...stock()[0], id: "other-tomatoes", name: "Tomatoes", location: "Freezer" as const }];
  const rows = preparePantryImport("Tomatoes", "list", defaults, pantry, known(pantry));
  assert.equal(rows[0].ingredientId, null);
  assert.equal(rows[0].candidates.length, 2);
  assert.throws(() => applyPantryImport(pantry, rows, known(pantry)), /Choose which ingredient/);
  assert.throws(() => applyPantryImport(pantry, [{ ...rows[0], ingredientId: "not-a-choice" }], known(pantry)), /Choose which ingredient/);
  const result = applyPantryImport(pantry, [{ ...rows[0], ingredientId: "other-tomatoes" }], known(pantry));
  assert.equal(result.operation.entries[0].item.id, "other-tomatoes");
});

test("custom identities are stable across receipts and lists; renaming clears the choice", () => {
  const first = preparePantryImport("Family chilli paste", "list", defaults, [], []);
  const second = preparePantryImport("Family chilli paste $4.00", "receipt", { ...defaults, unit: "ml" }, [], []);
  assert.equal(first[0].ingredientId, second[0].ingredientId);
  assert.match(first[0].ingredientId ?? "", /^custom-/);
  const changed = resolvePantryImportRow({ ...first[0], name: "Cooked rice", ingredientId: null, candidates: [] }, []);
  assert.equal(changed.ingredientId, "cooked-rice");
  assert.equal(applyPantryImport([], first, []).operation.entries[0].item.id, first[0].ingredientId);
});

test("invalid rows and duplicate or mixed totals fail before any stock changes", () => {
  const pantry = stock();
  const rows = preparePantryImport("Tomatoes, lemons", "list", defaults, pantry, known(pantry));
  assert.throws(() => applyPantryImport(pantry, [rows[0], { ...rows[1], quantity: -1 }], known(pantry)), PantryImportError);
  assert.throws(() => applyPantryImport(pantry, [rows[0], rows[0]], known(pantry)), /one current total/);
  assert.throws(() => applyPantryImport(pantry, [rows[0], { ...rows[0], intent: "add" }], known(pantry)), /one current total/);
  assert.throws(() => applyPantryImport(pantry, [{ ...rows[0], intent: "add", quantity: 0 }], known(pantry)), /purchase needs/);
  assert.equal(applyPantryImport(pantry, [{ ...rows[0], quantity: 0 }], known(pantry)).operation.entries[0].item.quantity, 0);
  assert.deepEqual(pantry, stock());
});
