import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema } from "@/lib/contracts";
import { ensurePilot } from "@/features/planning/pilot";
import { reviewNaturalPackageRequest, runLocalPlanning } from "./local-planner";

const state = () => ensurePilot(householdStateSchema.parse({ version: 1, pantry: [], preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true }, meals: [] }), "2026-10-12");

test("package statements become reviewable commands from current original text without inference or state mutation", async () => {
  const current = state();
  const result = await runLocalPlanning(current, "I have 10 cans of canned white beans", { verify: false });
  assert.equal(result.operations.length, 1);
  const operation = result.operations[0];
  assert.equal(operation.type, "set_package_stock");
  assert.equal(operation.type === "set_package_stock" && operation.stock.count, 10);
  assert.equal(operation.type === "set_package_stock" && operation.stock.sourceNote, "I have 10 cans of canned white beans");
  assert.deepEqual(current.pilot.packageStock, []);
  const bought = reviewNaturalPackageRequest(current, "I bought 3 jars of tomato sauce")!;
  assert.equal(bought.operations[0].type, "record_package_purchase");
  const opened = reviewNaturalPackageRequest(current, "I have half a jar of tomato sauce")!;
  assert.equal(opened.operations[0].type === "set_package_stock" && opened.operations[0].stock.status, "some");
});

test("package action ambiguity, unspecified ingredient forms and partial purchase counts produce no actions", () => {
  for (const request of ["10 cans of canned white beans", "I have 10 cans of beans", "I bought half a jar of tomato sauce", "I bought 0 cans of canned white beans"]) {
    const result = reviewNaturalPackageRequest(state(), request)!;
    assert.ok(result); assert.deepEqual(result.operations, []);
  }
  assert.equal(reviewNaturalPackageRequest(state(), "Please plan meals using 10 cans of beans"), null);
  assert.equal(reviewNaturalPackageRequest(state(), "I have 10 cans of beans, then plan lunches"), null);
});

test("cancelled package planning is aborted before producing a proposal", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => runLocalPlanning(state(), "I have 10 cans of canned white beans", { verify: false, signal: controller.signal }), { name: "AbortError" });
});
