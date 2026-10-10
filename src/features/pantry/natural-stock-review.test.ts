import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema, type HouseholdState, type PilotOperation } from "@/lib/contracts";
import { applyPilotCommand, ensurePilot } from "@/features/planning/pilot";
import { prepareNaturalStockEntry } from "./natural-stock-entry";
import { assertNaturalStockReviewCurrent, captureNaturalStockReview } from "./natural-stock-review";

function kitchen() {
  return ensurePilot(householdStateSchema.parse({ version: 1, pantry: [{ id: "apple", name: "Apple", quantity: 10, unit: "each", location: "Cupboard", useSoon: false }], preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true }, meals: [] }), "2026-10-12");
}
let sequence = 0;
function change(state: HouseholdState, operation: PilotOperation) {
  return applyPilotCommand(state, { id: `review-${sequence++}`, expectedRevision: state.pilot!.revision, operation }).state;
}

test("an open package total review cannot overwrite a partner's later purchase", () => {
  const initial = change(kitchen(), { type: "set_package_stock", stock: { ingredientId: "beans", name: "Canned white beans", packageKind: "can", status: "exact", count: 10 } });
  const review = captureNaturalStockReview(initial);
  const draft = prepareNaturalStockEntry("I have 10 cans of canned white beans");
  const updated = change(initial, { type: "record_package_purchase", items: [{ ingredientId: "beans", name: "Canned white beans", packageKind: "can", count: 2 }] });
  assert.throws(() => assertNaturalStockReviewCurrent(review, updated, draft), /review was open/);
  assert.equal(updated.pilot.packageStock[0].count, 12);
  assert.doesNotThrow(() => assertNaturalStockReviewCurrent(captureNaturalStockReview(updated), updated, draft));
});

test("measured totals detect stock changes and uncertainty while additions remain additive", () => {
  const initial = kitchen();
  const review = captureNaturalStockReview(initial);
  const draft = prepareNaturalStockEntry("I have 10 apples");
  const purchased = change(initial, { type: "record_purchase", items: [{ ingredientId: "apple", name: "Apple", unit: "each", quantity: 2 }] });
  assert.throws(() => assertNaturalStockReviewCurrent(review, purchased, draft));
  const uncertain = change(initial, { type: "set_stock", stock: { ingredientId: "apple", name: "Apple", unit: "each", status: "some" } });
  assert.throws(() => assertNaturalStockReviewCurrent(review, uncertain, draft));
  assert.doesNotThrow(() => assertNaturalStockReviewCurrent(review, purchased, { ...draft, operation: "add_purchase" }));
});

test("a purchase against an unknown package balance still invalidates an older total review", () => {
  const initial = change(kitchen(), { type: "set_package_stock", stock: { ingredientId: "beans", name: "Canned white beans", packageKind: "can", status: "some" } });
  const review = captureNaturalStockReview(initial);
  const draft = prepareNaturalStockEntry("I have 10 cans of canned white beans");
  const updated = change(initial, { type: "record_package_purchase", items: [{ ingredientId: "beans", name: "Canned white beans", packageKind: "can", count: 2 }] });
  assert.equal(updated.pilot.packageStock[0].status, "some");
  assert.throws(() => assertNaturalStockReviewCurrent(review, updated, draft));
  assert.doesNotThrow(() => assertNaturalStockReviewCurrent(review, updated, { ...draft, operation: "add_purchase" }));
});

test("review follows an edited target and rejects changed canonical identity choices", () => {
  const initial = kitchen();
  const review = captureNaturalStockReview(initial);
  const changed = change(initial, { type: "set_stock", stock: { ingredientId: "banana", name: "Banana", unit: "each", status: "exact", quantity: 4 } });
  assert.throws(() => assertNaturalStockReviewCurrent(review, changed, prepareNaturalStockEntry("I have 3 bananas")));
  const ambiguous = structuredClone(initial);
  ambiguous.pantry.push({ id: "other-apple", name: "Apple", quantity: 1, unit: "each", location: "Cupboard", useSoon: false, tag: "special" });
  assert.throws(() => assertNaturalStockReviewCurrent(review, ambiguous, prepareNaturalStockEntry("I have 10 apples")));
});

test("unrelated stock, transcript growth and revision bookkeeping do not invalidate a reviewed total", () => {
  const initial = kitchen();
  const review = captureNaturalStockReview(initial);
  const changed = change(initial, { type: "set_package_stock", stock: { ingredientId: "beans", name: "Canned white beans", packageKind: "can", status: "exact", count: 3 } });
  changed.pilot.session.messages.push({ id: "conversation", role: "user", text: "What could we cook?", recipes: [], servings: 2 });
  assert.doesNotThrow(() => assertNaturalStockReviewCurrent(review, changed, prepareNaturalStockEntry("I have 10 apples")));
});
