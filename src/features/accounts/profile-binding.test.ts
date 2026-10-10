import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "@/features/pantry/seed";
import { ensurePilot } from "@/features/planning/pilot";
import { extractExplicitProfileChanges } from "@/features/planning/profile";
import type { PilotOperation } from "@/lib/contracts";
import { assertProfileResultJob, reduceRemoteCommand } from "./server-household";
import { validateAiJobResult } from "@/features/meals/jobs-server";
import { claimedAiJobSchema, type AiJobResult } from "@/features/meals/jobs";
import { remoteCommandSchema } from "@/features/pantry/remote-protocol";

const jobId = "37c631af-22a3-455c-a598-eeb2a1d14ea2";
function setup() {
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  const current = { householdId: "37c631af-22a3-455c-a598-eeb2a1d14ea1", revision: 0, state };
  const message = "I dislike mushrooms.";
  const data = { source: "ai" as const, reply: "Those preferences will guide future meal ideas.", recipes: [], servings: 2,
    profileChanges: extractExplicitProfileChanges(state, message, "you") };
  const row = { status: "completed", household_revision: 0, session_id: state.pilot.session.id, requested_by: "user-a",
    request: { kind: "chat", input: { pantry: state.pantry, preferences: state.preferences, meals: [], recipeBox: [], messages: [], message } },
    result: { kind: "chat", data },
  };
  const operation: Extract<PilotOperation, { type: "receive_recipe_chat_result" }> = {
    type: "receive_recipe_chat_result", baseRevision: 0, jobId, request: message, actorMemberId: "you", submittedDraft: message, result: data,
  };
  return { current, row, operation };
}

test("profile acceptance binds original requester, completed job, exact result, current revision and session", () => {
  const { current, row, operation } = setup();
  assert.doesNotThrow(() => assertProfileResultJob(current, operation, row, "you"));
  for (const forged of [null, { ...row, status: "running" }, { ...row, status: "cancelled" }, { ...row, household_revision: 1 },
    { ...row, session_id: "another-session" }, { ...row, request: { kind: "planning", message: operation.request } },
    { ...row, result: { ...row.result, data: { ...row.result.data, profileChanges: [] } } },
  ]) assert.throws(() => assertProfileResultJob(current, operation, forged, "you"), /assistant|preferences/);
  assert.throws(() => assertProfileResultJob(current, operation, row, "partner"), /requester/);
  assert.throws(() => assertProfileResultJob(current, { ...operation, actorMemberId: "partner" }, row, "you"), /requester/);
  assert.throws(() => assertProfileResultJob(current, { ...operation, request: "I dislike carrots." }, row, "you"), /completed assistant/);
  assert.throws(() => assertProfileResultJob(current, { ...operation, result: { ...operation.result, reply: "Forged transcript" } }, row, "you"), /completed assistant/);
  assert.throws(() => assertProfileResultJob({ ...current, revision: 1 }, operation, row, "you"), /household/);
});

test("planning profile source uses the same exact current-request proof without authorizing third-party learning", () => {
  const { current, row, operation } = setup();
  const source = { jobId, request: operation.request, actorMemberId: "you", changes: operation.result.profileChanges! };
  const planning: Extract<PilotOperation, { type: "receive_planning_result" }> = { type: "receive_planning_result", baseRevision: 0,
    session: { ...current.state.pilot.session, messages: [{ id: `job-${jobId}-user`, role: "user", text: source.request, authorMemberId: "you", recipes: [], servings: 2 }] }, profileSource: source };
  const completed = { ...row, request: { kind: "planning", message: source.request },
    result: { kind: "planning", data: { reply: "Those preferences will guide meal ideas.", recipes: [], operations: [], profileChanges: source.changes } },
  };
  assert.doesNotThrow(() => assertProfileResultJob(current, planning, completed, "you"));
  assert.throws(() => assertProfileResultJob(current, { ...planning, session: current.state.pilot.session }, completed, "you"), /conversation/);
  assert.throws(() => assertProfileResultJob(current, { ...planning, session: { ...planning.session,
    messages: planning.session.messages.map((message) => ({ ...message, authorMemberId: "partner" })) } }, completed, "you"), /conversation/);
  const thirdParty = "My wife dislikes mushrooms.";
  assert.throws(() => assertProfileResultJob(current, { ...planning, profileSource: { ...source, request: thirdParty } },
    { ...completed, request: { kind: "planning", message: thirdParty } }, "you"), /preferences/);
});

test("worker result validation requires deterministic effects and refuses model-authored profile commands", () => {
  const { current, operation } = setup();
  const job = claimedAiJobSchema.parse({ id: jobId, householdId: current.householdId, sessionId: current.state.pilot.session.id,
    householdRevision: 0, kind: "planning", request: { kind: "planning", message: operation.request }, context: current.state, actorMemberId: "you",
    leaseToken: "37c631af-22a3-455c-a598-eeb2a1d14ea3", leaseExpiresAt: "2026-10-10T18:01:30Z", status: "running", result: null, error: null,
    attempts: 1, createdAt: "2026-10-10T18:00:00Z", updatedAt: "2026-10-10T18:00:00Z" });
  const result: AiJobResult = { kind: "planning", data: { reply: "Those preferences will guide meal ideas.", recipes: [], operations: [], profileChanges: operation.result.profileChanges } };
  assert.doesNotThrow(() => validateAiJobResult(job, result));
  assert.throws(() => validateAiJobResult(job, { ...result, data: { ...result.data, profileChanges: [] } }), /preferences/);
  assert.throws(() => validateAiJobResult({ ...job, request: { kind: "planning", message: "Discuss the plan." } }, result), /preferences/);
  assert.throws(() => validateAiJobResult(job, { ...result, data: { ...result.data, operations: operation.result.profileChanges! } }), /model-authored/);
  assert.throws(() => validateAiJobResult(job, { ...result, data: { ...result.data, operations: [{ type: "propose", id: "inferred", title: "Remember", changes: operation.result.profileChanges! }] } }), /model-authored/);
});

test("shared feedback is stamped from the authenticated actor, including proposals, without rewriting legacy entries", () => {
  const { current } = setup();
  current.state.pilot.feedback.push({ id: "old", recipeId: "pasta", rating: 3, makeAgain: false, notes: "Legacy" });
  const feedback = { id: "new", recipeId: "pasta", rating: 5, makeAgain: true, notes: "Good" };
  const command = (operation: PilotOperation, revision = 0) => remoteCommandSchema.parse({ householdId: current.householdId,
    commandId: jobId, expectedRevision: revision, command: { kind: "pilot", command: { id: jobId, expectedRevision: revision, operation } } });
  const actor = { ...current, currentMemberId: "you" };
  const saved = reduceRemoteCommand(actor, command({ type: "record_feedback", feedback }));
  assert.equal(saved.state.pilot?.feedback.find((entry) => entry.id === "new")?.memberId, "you");
  assert.equal(saved.state.pilot?.feedback.find((entry) => entry.id === "old")?.memberId, undefined);
  assert.throws(() => reduceRemoteCommand(actor, command({ type: "record_feedback", feedback: { ...feedback, memberId: "partner" } })), /person making/);
  assert.throws(() => reduceRemoteCommand(current, command({ type: "record_feedback", feedback })), /household person/);
  for (const operation of [
    { type: "propose" as const, id: "proposal", title: "Rate recipe", changes: [{ type: "record_feedback" as const, feedback }] },
    { type: "receive_planning_result" as const, baseRevision: 0, session: current.state.pilot.session,
      proposal: { id: "proposal", title: "Rate recipe", changes: [{ type: "record_feedback" as const, feedback }] } },
  ]) {
    const proposed = reduceRemoteCommand(actor, command(operation));
    const first = proposed.state.pilot!.proposals.find((entry) => entry.id === "proposal")!.changes[0];
    assert.equal(first.type === "record_feedback" && first.feedback.memberId, "you");
    const accepted = reduceRemoteCommand({ ...current, revision: 1, state: proposed.state, currentMemberId: "partner" },
      remoteCommandSchema.parse({ ...command({ type: "apply_proposal", proposalId: "proposal" }, 1), commandId: "37c631af-22a3-455c-a598-eeb2a1d14ea9",
        command: { kind: "pilot", command: { id: "accept", expectedRevision: 1, operation: { type: "apply_proposal", proposalId: "proposal" } } } }));
    assert.equal(accepted.state.pilot?.feedback.find((entry) => entry.id === "new")?.memberId, "you");
  }
});
