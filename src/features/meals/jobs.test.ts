import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "@/features/pantry/seed";
import { ensurePilot } from "@/features/planning/pilot";
import { claimedAiJobSchema, isWorkerOnline } from "./jobs";
import { authorizeWorker, validateAiJobResult } from "./jobs-server";

const householdId = "37c631af-22a3-455c-a598-eeb2a1d14ea1";
const job = () => claimedAiJobSchema.parse({
  id: "37c631af-22a3-455c-a598-eeb2a1d14ea2", householdId, sessionId: "session", householdRevision: 0,
  kind: "planning", request: { kind: "planning", message: "Plan lunch." }, context: ensurePilot(createSampleHousehold(), "2026-10-08"), actorMemberId: "member-you",
  leaseToken: "37c631af-22a3-455c-a598-eeb2a1d14ea3", leaseExpiresAt: "2026-10-08T12:01:30Z",
  status: "running", result: null, error: null, attempts: 1, createdAt: "2026-10-08T12:00:00Z", updatedAt: "2026-10-08T12:00:00Z",
});

test("local worker authorization requires a strong configured credential and scoped household", () => {
  const token = "a".repeat(40);
  const request = new Request("http://localhost", { headers: { Authorization: `Bearer ${token}` } });
  assert.throws(() => authorizeWorker(request, {}));
  assert.throws(() => authorizeWorker(request, { LUNCHBOX_WORKER_TOKEN: "b".repeat(40), LUNCHBOX_WORKER_HOUSEHOLD_ID: householdId }));
  assert.equal(authorizeWorker(request, { LUNCHBOX_WORKER_TOKEN: token, LUNCHBOX_WORKER_HOUSEHOLD_ID: householdId }), householdId);
});

test("worker is visibly offline when its heartbeat expires", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  assert.equal(isWorkerOnline(null, now), false);
  assert.equal(isWorkerOnline("invalid", now), false);
  assert.equal(isWorkerOnline("2026-10-08T11:59:00Z", now), true);
  assert.equal(isWorkerOnline("2026-10-08T11:57:59Z", now), false);
  assert.equal(isWorkerOnline("2027-10-08T12:00:00Z", now), false);
});

test("worker operations are validated as proposals without applying them to household state", () => {
  const input = job();
  const before = structuredClone(input.context);
  validateAiJobResult(input, { kind: "planning", data: { reply: "Here is a proposed shopping horizon.", recipes: [], operations: [{ type: "set_shop_through", date: "2026-10-15" }] } });
  assert.deepEqual(input.context, before);
  assert.throws(() => validateAiJobResult(input, { kind: "planning", data: { reply: "Invalid", recipes: [], operations: [{ type: "remove_batch", batchId: "does-not-exist" }] } }));
  assert.throws(() => validateAiJobResult(input, { kind: "suggest", data: { source: "ai", recipes: [] } }));
});
