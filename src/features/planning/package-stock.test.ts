import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, packageStockSchema, type HouseholdState, type PilotOperation, type Recipe, type Unit } from "@/lib/contracts";
import { applyPilotCommand, buildPilotShoppingList, ensurePilot } from "./pilot";
import { canRebaseRemoteCommand } from "@/features/pantry/remote-conflicts";

let sequence = 0;
const now = "2026-10-12T12:00:00.000Z";
function state(quantity = 0, unit: Unit = "g") {
  return ensurePilot(householdStateSchema.parse({ version: 1, pantry: [{ id: "beans", name: "Canned white beans", quantity, unit, location: "Cupboard", useSoon: true }], preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true }, meals: [] }), "2026-10-12");
}
function run(current: HouseholdState, operation: PilotOperation, id = `package-command-${sequence++}`) {
  return applyPilotCommand(current, { id, expectedRevision: current.pilot!.revision, operation }, { now });
}
const packages = (count = 10): PilotOperation => ({ type: "set_package_stock", stock: { ingredientId: "beans", name: "Canned white beans", packageKind: "can", status: "exact", count, sourceNote: `I have ${count} cans` } });
const purchase: PilotOperation = { type: "record_package_purchase", items: [{ ingredientId: "beans", name: "Canned white beans", packageKind: "can", count: 2, sourceNote: "I bought two cans" }] };
function batch(unit: Unit = "g", quantity = 300, id = "beans-batch"): PilotOperation {
  const recipe: Recipe = { id: "beans-recipe", name: "Beans", description: "Cooked beans", servings: 2, minutes: 15, ingredients: [{ ingredientId: "beans", name: "Canned white beans", unit, quantity }], steps: ["Heat the beans."] };
  return { type: "create_batch", batch: { id, recipe, yield: 2, reservedExtra: 0, prepareDate: "2026-10-12" }, allocations: [] };
}
function confirm(current: HouseholdState) {
  let next = current;
  for (const check of buildPilotShoppingList(current).checks) next = run(next, { type: "confirm_stock", ingredientId: check.ingredientId, unit: check.unit, fingerprint: check.fingerprint }).state;
  return ensurePilot(next);
}

test("additive package defaults migrate current state and old inverse data without changing each", () => {
  const original = run(state(10, "each"), { type: "set_stock", stock: { ingredientId: "beans", name: "Canned white beans", unit: "each", status: "exact", quantity: 10 } }).state;
  const legacy = JSON.parse(JSON.stringify(original));
  delete legacy.pilot.packageStock; delete legacy.pilot.packagePurchases;
  delete legacy.pilot.receipts[0].inverse.data.packageStock; delete legacy.pilot.receipts[0].inverse.data.packagePurchases;
  const migrated = ensurePilot(legacy);
  assert.deepEqual(migrated.pilot.packageStock, []); assert.deepEqual(migrated.pilot.packagePurchases, []);
  assert.deepEqual(migrated.pilot.receipts[0].inverse!.data.packageStock, []);
  assert.equal(migrated.pantry[0].quantity, 10); assert.equal(migrated.pantry[0].unit, "each");
  assert.equal(packageStockSchema.safeParse({ ingredientId: "beans", name: "Beans", packageKind: "can", status: "exact", count: 0.5 }).success, false);
  assert.equal(packageStockSchema.safeParse({ ingredientId: "beans", name: "Beans", packageKind: "can", status: "some", count: 1 }).success, false);
});

test("package totals stay independent of measured balances and purchases are retry-safe historical additions", () => {
  let current = run(state(900), packages()).state;
  assert.equal(current.pantry[0].quantity, 900);
  const command = { id: "package-purchase-once", expectedRevision: current.pilot.revision, operation: purchase };
  current = applyPilotCommand(current, command, { now }).state;
  assert.equal(current.pilot.packageStock[0].count, 12);
  assert.equal(current.pilot.packagePurchases[0].count, 2);
  assert.equal(current.pilot.packagePurchases[0].sourceNote, "I bought two cans");
  assert.equal(current.pilot.packagePurchases[0].recordedAt, now);
  const duplicate = applyPilotCommand(current, command);
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.state.pilot.packagePurchases.length, 1);
  current = run(current, { type: "set_package_stock", stock: { ingredientId: "beans", name: "Canned white beans", packageKind: "can", status: "some", sourceNote: "An opened can" } }).state;
  current = run(current, purchase).state;
  assert.equal(current.pilot.packageStock[0].status, "some"); assert.equal(current.pilot.packageStock[0].count, undefined);
  assert.deepEqual(current.pilot.packagePurchases.map((entry) => entry.count), [2, 2]);
  current = run(current, packages(0)).state;
  assert.equal(current.pantry[0].quantity, 900); assert.equal(current.pilot.packagePurchases.length, 2);
  const before = structuredClone(current);
  assert.throws(() => run(current, { type: "record_package_purchase", items: [{ ingredientId: "beans", name: "Beans", packageKind: "can", count: 0.5 }] }));
  assert.deepEqual(current, before);
});

test("package-backed checks cover every recipe unit and expose unverified remainder once", () => {
  for (const unit of ["g", "ml", "each"] as const) {
    let current = run(state(100, unit), packages()).state;
    current = run(current, batch(unit)).state;
    const shopping = buildPilotShoppingList(current);
    assert.equal(shopping.shortages.length, 0); assert.equal(shopping.checks.length, 1);
    assert.equal(shopping.checks[0].required, 300); assert.equal(shopping.checks[0].knownAvailable, 100); assert.equal(shopping.checks[0].knownRemainder, 200);
    assert.equal(shopping.checks[0].packageStock[0].count, 10);
    current = confirm(current);
    assert.equal(buildPilotShoppingList(current).checks[0].resolved, true);
    current = run(current, purchase).state;
    assert.equal(buildPilotShoppingList(current).checks[0].resolved, false);
    current = confirm(current);
    current = run(current, { type: "set_stock", stock: { ingredientId: "beans", name: "Beans", unit, status: "exact", quantity: 150 } }).state;
    assert.equal(buildPilotShoppingList(current).checks[0].resolved, false);
    current = run(current, packages(0)).state;
    assert.equal(buildPilotShoppingList(current).checks.length, 0); assert.equal(buildPilotShoppingList(current).shortages[0].quantity, 150);
  }
  let covered = run(state(500), packages()).state;
  covered = run(covered, batch()).state;
  assert.deepEqual(buildPilotShoppingList(covered).checks, []);
});

test("confirmed package cooking leaves both remaining contents and counts unknown and Undo restores truth atomically", () => {
  let current = run(state(100), packages()).state;
  current = run(current, purchase).state;
  current = run(current, batch()).state;
  const cook: PilotOperation = { type: "cook_batch", batchId: "beans-batch", actualPortions: 2, freezerPortions: 0 };
  assert.throws(() => run(current, cook), /Confirm or purchase enough/);
  current = confirm(current);
  const before = structuredClone(current);
  const cooked = run(current, cook);
  assert.equal(cooked.state.pilot.packageStock[0].status, "some"); assert.equal(cooked.state.pilot.packageStock[0].count, undefined);
  assert.equal(cooked.state.pilot.stock[0].status, "some"); assert.equal(cooked.state.pilot.stock[0].quantity, undefined);
  assert.deepEqual(cooked.state.pilot.packagePurchases, before.pilot.packagePurchases);
  assert.equal(cooked.state.pilot.stockChecks.length, 0);
  const undone = run(cooked.state, { type: "undo", receiptId: cooked.receipt.id }).state;
  assert.deepEqual(undone.pilot.packageStock, before.pilot.packageStock);
  assert.deepEqual(undone.pilot.stock, before.pilot.stock);
  assert.deepEqual(undone.pantry, before.pantry);
  assert.deepEqual(undone.pilot.stockChecks, before.pilot.stockChecks);
  assert.deepEqual(undone.pilot.packagePurchases, before.pilot.packagePurchases);
});

test("known stock cooking deducts deterministically while invalidating unmeasured container count", () => {
  let current = run(state(500), packages()).state;
  current = run(current, batch()).state;
  current = run(current, { type: "cook_batch", batchId: "beans-batch", actualPortions: 2, freezerPortions: 0 }).state;
  assert.equal(current.pantry[0].quantity, 200);
  assert.equal(current.pilot.packageStock[0].status, "some");
  assert.equal(current.pilot.packageStock[0].count, undefined);
});

test("changed demand reopens package checks and cooking validates every unit before invalidating containers", () => {
  let current = run(state(0), packages()).state;
  const mixed = batch();
  assert.equal(mixed.type, "create_batch");
  if (mixed.type !== "create_batch") return;
  mixed.batch.recipe.ingredients.push({ ingredientId: "beans", name: "Canned white beans", unit: "each", quantity: 2 });
  current = run(current, mixed).state;
  current = confirm(current);
  assert.equal(buildPilotShoppingList(current).checks.filter((entry) => entry.resolved).length, 2);
  const cooked = run(current, { type: "cook_batch", batchId: "beans-batch", actualPortions: 2, freezerPortions: 0 }).state;
  assert.equal(cooked.pilot.stock.filter((entry) => entry.status === "some").length, 2);
  assert.equal(cooked.pilot.packageStock[0].count, undefined);
  current = run(current, batch("g", 100, "extra-batch")).state;
  assert.equal(buildPilotShoppingList(current).checks.find((entry) => entry.unit === "g")!.resolved, false);
  assert.throws(() => run(current, { type: "cook_batch", batchId: "beans-batch", actualPortions: 2, freezerPortions: 0 }), /Confirm or purchase enough/);
});

test("package additions reject an overflowing aggregate atomically without partial history", () => {
  const current = run(state(), packages(99999)).state;
  const before = structuredClone(current);
  assert.throws(() => run(current, purchase));
  assert.deepEqual(current, before);
});

test("package totals never rebase over newer household stock but package additions can", () => {
  const command = (operation: PilotOperation) => ({ command: { kind: "pilot" as const, command: { id: "test", expectedRevision: 0, operation } } });
  assert.equal(canRebaseRemoteCommand(command(packages())), false);
  assert.equal(canRebaseRemoteCommand(command(purchase)), true);
});
