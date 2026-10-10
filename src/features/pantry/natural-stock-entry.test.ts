import assert from "node:assert/strict";
import test from "node:test";
import { naturalStockEntryOperation, prepareNaturalStockEntry } from "./natural-stock-entry";

test("natural entry preserves original text, explicit operation, measured units and whole food counts", () => {
  const apples = prepareNaturalStockEntry("I have 10 apples");
  assert.equal(apples.unit, "each"); assert.equal(apples.amount, 10); assert.equal(apples.ingredientId, "apple");
  assert.equal(apples.originalText, "I have 10 apples");
  assert.deepEqual(naturalStockEntryOperation(apples), { type: "set_stock", stock: { ingredientId: "apple", name: "Apple", unit: "each", status: "exact", quantity: 10, sourceNote: "I have 10 apples" } });
  const beans = prepareNaturalStockEntry("I bought 1000g canned white beans");
  assert.equal(beans.unit, "g"); assert.equal(beans.amount, 1000); assert.equal(beans.operation, "add_purchase");
  assert.equal(naturalStockEntryOperation(beans).type, "record_purchase");
  const bare = prepareNaturalStockEntry("10 apples");
  assert.equal(bare.operation, null);
  assert.throws(() => naturalStockEntryOperation(bare), /current total or a purchase/);
  assert.throws(() => prepareNaturalStockEntry("beans"), /number and/);
  assert.throws(() => prepareNaturalStockEntry("10 kg beans"), /number and/);
});

test("all supported package kinds preserve exact whole count without creating recipe units", () => {
  for (const [word, kind] of [["cans", "can"], ["bags", "bag"], ["jars", "jar"], ["box", "box"], ["boxes", "box"], ["bottles", "bottle"]]) {
    const draft = prepareNaturalStockEntry(`I have 10 ${word} of canned white beans`);
    assert.equal(draft.packageKind, kind); assert.equal(draft.unit, null); assert.equal(draft.amount, 10);
    assert.equal(draft.ingredientId, "beans");
    const operation = naturalStockEntryOperation(draft);
    assert.equal(operation.type, "set_package_stock");
    assert.equal("stock" in operation && "quantity" in operation.stock, false);
  }
  assert.equal(naturalStockEntryOperation(prepareNaturalStockEntry("I bought 3 jars of tomato sauce")).type, "record_package_purchase");
});

test("opened, partial and fractional containers are qualitative and require total meaning", () => {
  for (const phrase of ["half a jar", "an opened jar", "0.5 jars", "some jars", "a partial jar"]) {
    const draft = prepareNaturalStockEntry(`I have ${phrase} of tomato sauce`);
    assert.equal(draft.status, "some"); assert.equal(draft.amount, null);
    const operation = naturalStockEntryOperation(draft);
    assert.equal(operation.type, "set_package_stock");
    assert.equal("stock" in operation && "count" in operation.stock, false);
  }
  assert.throws(() => naturalStockEntryOperation(prepareNaturalStockEntry("I bought half a jar of tomato sauce")), /exact amount/);
  const zero = naturalStockEntryOperation(prepareNaturalStockEntry("I have 0 cans of canned white beans"));
  assert.equal(zero.type === "set_package_stock" && zero.stock.count, 0);
  assert.throws(() => naturalStockEntryOperation(prepareNaturalStockEntry("I bought 0 cans of canned white beans")));
});

test("identity ambiguity and unspecified qualitative measurement remain unresolved for review", () => {
  const known = [{ ingredientId: "a", name: "Apple", unit: "each" as const }, { ingredientId: "b", name: "Apple", unit: "g" as const }];
  const draft = prepareNaturalStockEntry("I have 3 bags of apples", known);
  assert.equal(draft.ingredientId, null); assert.equal(draft.candidates.length, 2);
  assert.throws(() => naturalStockEntryOperation(draft), /ingredient identity/);
  const generic = prepareNaturalStockEntry("I have 1000g beans");
  assert.equal(generic.ingredientId, null); assert.ok(generic.candidates.some((entry) => entry.ingredientId === "beans"));
  const qualitative = prepareNaturalStockEntry("I have some canned white beans");
  assert.equal(qualitative.amount, null); assert.equal(qualitative.unit, null);
  assert.throws(() => naturalStockEntryOperation(qualitative), /Choose g, ml, or each/);
});
