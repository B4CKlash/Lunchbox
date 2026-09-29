import assert from "node:assert/strict";
import test from "node:test";
import type { PantryItem } from "@/lib/contracts";
import { applyPantryImport, PantryImportError, preparePantryImport, resolvePantryImportRow } from "./import";

const defaults = { quantity: 5, unit: "g" as const, location: "Cupboard" as const, tag: "special" as const };
const stock = (): PantryItem[] => [
  { id: "legacy-tomatoes", name: "Roma tomatoes", quantity: 100, unit: "g", location: "Fridge", useSoon: true, tag: "seasonal", category: "vegetables", restockBelow: 20 },
  { id: "legacy-tomatoes", name: "Roma tomatoes", quantity: 3, unit: "each", location: "Garden", useSoon: false, tag: "staple", restockBelow: 1 },
];
const known = (pantry: PantryItem[]) => pantry.map((item) => ({ ingredientId: item.id, name: item.name, unit: item.unit }));

test("bulk aliases use canonical IDs and adding stock requires explicit merge", () => {
  const pantry = stock();
  const rows = preparePantryImport("Tomatoes", "list", defaults, pantry, known(pantry));
  assert.equal(rows[0].ingredientId, "legacy-tomatoes");
  assert.equal(rows[0].merge, false);
  assert.equal(rows[0].tag, "seasonal");
  const separate = applyPantryImport(pantry, rows, known(pantry));
  assert.equal(separate.pantry.length, 3);
  assert.equal(separate.pantry[2].id, "legacy-tomatoes");
  assert.equal(separate.pantry[0].quantity, 100);
  const merged = applyPantryImport(pantry, [{ ...rows[0], merge: true }], known(pantry));
  assert.equal(merged.pantry.length, 2);
  assert.deepEqual(merged.pantry[0], { ...pantry[0], quantity: 105 });
  assert.deepEqual(merged.pantry[1], pantry[1]);
  assert.equal(merged.updated, 1);
  assert.deepEqual(pantry, stock());
});

test("receipt rows preserve repeated purchases and merge only matching identity/unit indices", () => {
  const pantry = stock();
  const rows = preparePantryImport("2 Tomatoes $3.49\n3 Tomatoes $4.20\nTOTAL $7.69\nTax $0.00", "receipt", { ...defaults, unit: "each" }, pantry, known(pantry));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.quantity), [2, 3]);
  const result = applyPantryImport(pantry, rows.map((row) => ({ ...row, merge: true })), known(pantry));
  assert.equal(result.pantry[1].quantity, 8);
  assert.equal(result.pantry[1].tag, "staple");
  assert.deepEqual(result.pantry[0], pantry[0]);
  assert.equal(result.updated, 1);
});

test("ambiguous import names require one of the presented identities", () => {
  const pantry = [...stock(), { ...stock()[0], id: "other-tomatoes", name: "Tomatoes", location: "Freezer" as const }];
  const rows = preparePantryImport("Tomatoes", "list", defaults, pantry, known(pantry));
  assert.equal(rows[0].ingredientId, null);
  assert.equal(rows[0].candidates.length, 2);
  assert.throws(() => applyPantryImport(pantry, rows, known(pantry)), /Choose which ingredient/);
  assert.throws(() => applyPantryImport(pantry, [{ ...rows[0], ingredientId: "not-a-choice" }], known(pantry)), /Choose which ingredient/);
  const selected = { ...rows[0], ingredientId: "other-tomatoes", merge: true };
  const result = applyPantryImport(pantry, [selected], known(pantry));
  assert.equal(result.pantry[2].quantity, 105);
  assert.deepEqual(result.pantry.slice(0, 2), pantry.slice(0, 2));
});

test("new custom identities are stable across receipt and list entry, and name changes clear choices", () => {
  const first = preparePantryImport("Family chilli paste", "list", defaults, [], []);
  const second = preparePantryImport("Family chilli paste $4.00", "receipt", { ...defaults, unit: "ml" }, [], []);
  assert.equal(first[0].ingredientId, second[0].ingredientId);
  assert.match(first[0].ingredientId ?? "", /^custom-/);
  const changed = resolvePantryImportRow({ ...first[0], name: "Cooked rice", ingredientId: null, candidates: [] }, []);
  assert.equal(changed.ingredientId, "cooked-rice");
  assert.equal(applyPantryImport([], first, []).pantry[0].id, first[0].ingredientId);
});

test("invalid reviewed rows fail atomically without losing earlier stock or tags", () => {
  const pantry = stock();
  const rows = preparePantryImport("Tomatoes, lemons", "list", defaults, pantry, known(pantry));
  rows[0].merge = true;
  rows[1].quantity = -1;
  assert.throws(() => applyPantryImport(pantry, rows, known(pantry)), PantryImportError);
  assert.deepEqual(pantry, stock());
});
