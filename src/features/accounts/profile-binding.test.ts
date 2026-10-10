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

test("shared feedback IDs cannot take another person's or legacy opinion through direct or proposed edits", () => {
  const { current } = setup();
  current.state.pilot.feedback = [
    { id: "owner-opinion", recipeId: "pasta", memberId: "you", rating: 1, makeAgain: false, notes: "Owner" },
    { id: "legacy-opinion", recipeId: "pasta", rating: 3, makeAgain: true, notes: "Legacy household" },
    { id: "partner-opinion", recipeId: "pasta", memberId: "partner", rating: 5, makeAgain: true, notes: "Partner" },
  ];
  const actor = { ...current, currentMemberId: "partner" };
  const before = structuredClone(current.state);
  const command = (operation: PilotOperation) => remoteCommandSchema.parse({ householdId: current.householdId,
    commandId: jobId, expectedRevision: 0, command: { kind: "pilot", command: { id: jobId, expectedRevision: 0, operation } } });
  for (const id of ["owner-opinion", "legacy-opinion"]) {
    const change = { type: "record_feedback" as const, feedback: { id, recipeId: "pasta", rating: 5, makeAgain: true, notes: "Replacement" } };
    for (const operation of [change,
      { type: "propose" as const, id: "proposal", title: "Replace opinion", changes: [change] },
      { type: "receive_planning_result" as const, baseRevision: 0, session: current.state.pilot.session,
        proposal: { id: "proposal", title: "Replace opinion", changes: [change] } },
    ]) assert.throws(() => reduceRemoteCommand(actor, command(operation)), /feedback ID belongs/);
    assert.deepEqual(current.state, before);
  }
  const own = reduceRemoteCommand(actor, command({ type: "record_feedback", feedback: { id: "partner-opinion", recipeId: "pasta", rating: 4, makeAgain: false, notes: "My correction" } }));
  assert.equal(own.state.pilot?.feedback.find((entry) => entry.id === "partner-opinion")?.rating, 4);
  assert.deepEqual(own.state.pilot?.feedback.filter((entry) => entry.id !== "partner-opinion"), before.pilot.feedback.filter((entry) => entry.id !== "partner-opinion"));
  const opposing = reduceRemoteCommand(actor, command({ type: "record_feedback", feedback: { id: "new-opinion", recipeId: "pasta", rating: 5, makeAgain: true, notes: "My separate opinion" } }));
  assert.equal(opposing.state.pilot?.feedback.length, 4);
  assert.deepEqual(opposing.state.pilot?.feedback.slice(0, 3), before.pilot.feedback);
  const recovered = structuredClone(actor);
  recovered.state.pilot.proposals.push({ id: "recovered-proposal", title: "Earlier proposal", baseRevision: 0, status: "pending",
    changes: [{ type: "record_feedback", feedback: { id: "owner-opinion", recipeId: "pasta", memberId: "partner", rating: 5, makeAgain: true, notes: "Earlier replacement" } }] });
  assert.throws(() => reduceRemoteCommand(recovered, command({ type: "apply_proposal", proposalId: "recovered-proposal" })), /feedback ID belongs/);
  assert.deepEqual(recovered.state.pilot.feedback, before.pilot.feedback);
});

test("manual personal profile changes and proposals require their authenticated owner while household facts remain shared", () => {
  const { current, operation } = setup();
  const ownChange = operation.result.profileChanges![0];
  assert.ok(ownChange.type === "upsert_profile_fact" && ownChange.value.kind === "food-dislike");
  const command = (operation: PilotOperation, revision = 0, id = jobId) => remoteCommandSchema.parse({ householdId: current.householdId,
    commandId: jobId, expectedRevision: revision, command: { kind: "pilot", command: { id, expectedRevision: revision, operation } } });
  assert.throws(() => reduceRemoteCommand(current, command(ownChange)), /household person/);
  const actor = { ...current, currentMemberId: "partner" };
  for (const authored of [ownChange,
    { type: "propose" as const, id: "proposal", title: "Remember owner preference", changes: [ownChange] },
    { type: "receive_planning_result" as const, baseRevision: 0, session: current.state.pilot.session,
      proposal: { id: "proposal", title: "Remember owner preference", changes: [ownChange] } },
  ]) assert.throws(() => reduceRemoteCommand(actor, command(authored)), /Personal food preferences/);
  const saved = reduceRemoteCommand({ ...current, currentMemberId: "you" }, command(ownChange));
  assert.equal(saved.state.pilot?.profileFacts[0].source.actorMemberId, "you");
  const latest = { ...current, state: saved.state, revision: 1, currentMemberId: "partner" };
  const remove = { type: "remove_profile_fact" as const, factId: saved.state.pilot!.profileFacts[0].id, sourceText: "Forget this" };
  assert.throws(() => reduceRemoteCommand(latest, command(remove, 1, "remove")), /Personal food preferences/);
  const corrected = { ...ownChange, value: { ...ownChange.value, disliked: false } };
  assert.throws(() => reduceRemoteCommand(latest, command(corrected, 1, "correction")), /Personal food preferences/);
  const ownCorrected = reduceRemoteCommand({ ...latest, currentMemberId: "you" }, command(corrected, 1, "own-correction"));
  assert.equal(ownCorrected.state.pilot?.profileFacts[0].value.kind === "food-dislike" && ownCorrected.state.pilot.profileFacts[0].value.disliked, false);
  assert.equal(ownCorrected.state.pilot?.profileFacts[0].source.actorMemberId, "you");
  const ownRemoved = reduceRemoteCommand({ ...latest, currentMemberId: "you" }, command(remove, 1, "own-remove"));
  assert.deepEqual(ownRemoved.state.pilot?.profileFacts, []);
  for (const value of [
    { kind: "equipment" as const, equipment: "oven", availability: "unavailable" as const },
    { kind: "food-dislike" as const, scope: { kind: "household" as const }, target: { kind: "category" as const, category: "vegetables" as const }, disliked: true },
  ]) {
    const shared = reduceRemoteCommand(actor, command({ type: "upsert_profile_fact", value, sourceText: "Shared kitchen fact" }));
    assert.equal(shared.state.pilot?.profileFacts[0].source.actorMemberId, "partner");
    assert.equal(shared.state.pilot?.profileFacts[0].source.kind, "manual");
  }
  const proposed = reduceRemoteCommand({ ...current, currentMemberId: "you" }, command({ type: "propose", id: "own-proposal", title: "My preference", changes: [ownChange] }));
  assert.throws(() => reduceRemoteCommand({ ...current, state: proposed.state, revision: 1, currentMemberId: "partner" }, command({ type: "apply_proposal", proposalId: "own-proposal" }, 1, "apply")), /Personal food preferences/);
});

test("partner acceptance of an exact completed profile result keeps the original speaker's personal scope and provenance", () => {
  const { current, operation } = setup();
  const command = remoteCommandSchema.parse({ householdId: current.householdId, commandId: jobId, expectedRevision: 0,
    command: { kind: "pilot", command: { id: jobId, expectedRevision: 0, operation } } });
  const saved = reduceRemoteCommand({ ...current, currentMemberId: "partner" }, command);
  const fact = saved.state.pilot!.profileFacts[0];
  assert.equal(fact.value.kind === "food-dislike" && fact.value.scope.kind === "member" && fact.value.scope.memberId, "you");
  assert.equal(fact.source.actorMemberId, "you"); assert.equal(fact.source.kind, "conversation");
  assert.equal(saved.state.workspace.chatMessages[0].authorMemberId, "you");
});
