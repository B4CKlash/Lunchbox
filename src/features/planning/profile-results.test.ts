import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "@/features/pantry/seed";
import { pilotCommandSchema, type PilotOperation } from "@/lib/contracts";
import { ensurePilot, applyPilotCommand } from "./pilot";
import { extractExplicitProfileChanges } from "./profile";
import { rebaseRemoteCommand } from "@/features/pantry/remote-conflicts";
import { remoteCommandSchema } from "@/features/pantry/remote-protocol";

const jobId = "37c631af-22a3-455c-a598-eeb2a1d14ea2";
const state = () => ensurePilot(createSampleHousehold(), "2026-10-12");
const now = "2026-10-10T18:00:00.000Z";
function chatOperation(current = state(), request = "I dislike mushrooms."): Extract<PilotOperation, { type: "receive_recipe_chat_result" }> {
  return { type: "receive_recipe_chat_result", baseRevision: current.pilot.revision, jobId, request, actorMemberId: "you", submittedDraft: request,
    result: { source: "ai", reply: "Those preferences will guide future meal ideas.", recipes: [], servings: 2,
      profileChanges: extractExplicitProfileChanges(current, request, "you") },
  };
}
const run = (current: ReturnType<typeof state>, operation: PilotOperation, id = "command") =>
  applyPilotCommand(current, { id, expectedRevision: current.pilot.revision, operation }, { now });

test("recipe-chat transcript and personal facts save atomically with grounded source and preserve a newer composer", () => {
  const current = state();
  current.workspace.chatDraft = "An unsent next question";
  const before = structuredClone(current);
  const operation = chatOperation(current);
  const result = run(current, operation);
  assert.deepEqual(current, before);
  assert.equal(result.state.workspace.chatDraft, "An unsent next question");
  assert.deepEqual(result.state.workspace.chatMessages.map(({ id, role, authorMemberId }) => ({ id, role, authorMemberId })), [
    { id: `job-${jobId}-user`, role: "user", authorMemberId: "you" },
    { id: `job-${jobId}-assistant`, role: "assistant", authorMemberId: undefined },
  ]);
  assert.deepEqual(result.state.pilot.profileFacts[0].source, {
    kind: "conversation", sourceText: operation.request, recordedAt: now, commandId: "command", jobId, messageId: `job-${jobId}-user`, actorMemberId: "you",
  });
  assert.ok(result.receipt.inverse);
  assert.match(result.receipt.summary, /1 explicit preference change/);
  assert.deepEqual(result.state.pantry, current.pantry);
  const undone = run(result.state, { type: "undo", receiptId: result.receipt.id }, "undo").state;
  assert.deepEqual(undone.pilot.profileFacts, []);
  assert.deepEqual(undone.workspace.chatMessages, result.state.workspace.chatMessages);
  assert.equal(undone.workspace.chatDraft, "An unsent next question");
  assert.deepEqual(undone.pantry, current.pantry);
});

test("planning saves facts and conversation together and Undo keeps its current transcript", () => {
  const current = state();
  const request = "We don't have an oven.";
  const session = { ...current.pilot.session, messages: [{ id: `job-${jobId}-user`, role: "user" as const, authorMemberId: "you", text: request, recipes: [], servings: 2 }] };
  const operation: PilotOperation = { type: "receive_planning_result", baseRevision: 0, session,
    profileSource: { jobId, request, actorMemberId: "you", changes: extractExplicitProfileChanges(current, request, "you") },
  };
  const saved = run(current, operation);
  assert.equal(saved.state.pilot.profileFacts[0].value.kind, "equipment");
  assert.ok(saved.receipt.inverse);
  const undone = run(saved.state, { type: "undo", receiptId: saved.receipt.id }, "undo").state;
  assert.deepEqual(undone.pilot.profileFacts, []);
  assert.deepEqual(undone.pilot.session.messages, session.messages);
  assert.throws(() => run(current, { ...operation, session: current.pilot.session }), /exact current message/);
  assert.throws(() => run(current, { ...operation, session: { ...session, messages: session.messages.map((message) => ({ ...message, text: "Unrelated request" })) } }), /exact current message/);
});

test("forged, missing, third-party and stale effects fail before either transcript or profile can change", () => {
  const current = state();
  const before = structuredClone(current);
  const operation = chatOperation(current);
  for (const invalid of [
    { ...operation, baseRevision: 2 },
    { ...operation, submittedDraft: "Something else" },
    { ...operation, actorMemberId: "missing-member" },
    { ...operation, request: "My wife dislikes mushrooms.", submittedDraft: "My wife dislikes mushrooms." },
    { ...operation, result: { ...operation.result, profileChanges: [] } },
    { ...operation, result: { ...operation.result, profileChanges: extractExplicitProfileChanges(current, "I dislike vegetables.", "you") } },
  ]) {
    assert.throws(() => run(current, pilotCommandSchema.shape.operation.parse(invalid)));
    assert.deepEqual(current, before);
  }
});

test("retry identifiers deduplicate atomically and another command cannot append the same completed chat again", () => {
  const current = state();
  const operation = chatOperation(current);
  const saved = run(current, operation);
  const duplicate = applyPilotCommand(saved.state, { id: "command", expectedRevision: 0, operation });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual(duplicate.state, saved.state);
  const sameReply = { ...operation, baseRevision: saved.state.pilot.revision, result: { ...operation.result, profileChanges: [] } };
  assert.throws(() => run(saved.state, sameReply, "different"), /already been saved/);
});

test("profile correction Undo restores its prior value and manual provenance, without editing authored legacy preferences", () => {
  const current = state();
  const authored = structuredClone(current.preferences);
  const first = run(current, { type: "upsert_profile_fact", value: { kind: "equipment", equipment: "oven", availability: "available" }, sourceText: "Added in settings" }, "manual");
  const request = "We no longer have an oven.";
  const second = run(first.state, chatOperation(first.state, request), "correction");
  assert.equal(second.state.pilot.profileFacts.length, 1);
  const undone = run(second.state, { type: "undo", receiptId: second.receipt.id }, "undo").state;
  assert.deepEqual(undone.pilot.profileFacts, first.state.pilot.profileFacts);
  assert.deepEqual(undone.preferences, authored);
  assert.equal(undone.workspace.chatMessages.length, 2);
});

test("profile result and absolute fact edits cannot rebase over another device's changes", () => {
  const current = state();
  const chat = chatOperation(current);
  const changes = extractExplicitProfileChanges(current, chat.request, "you");
  for (const operation of [chat, changes[0], { type: "remove_profile_fact", factId: "some-fact", sourceText: "Forget this" }]) {
    const request = remoteCommandSchema.parse({ householdId: jobId, commandId: jobId, expectedRevision: 0,
      command: { kind: "pilot", command: { id: jobId, expectedRevision: 0, operation } } });
    assert.equal(rebaseRemoteCommand(request, 1), null);
  }
});

test("member removal cannot orphan a person-scoped profile fact", () => {
  const initial = state();
  const saved = run(initial, extractExplicitProfileChanges(initial, "I dislike vegetables.", "you")[0]).state;
  assert.throws(() => run(saved, { type: "set_members", members: saved.pilot.members.filter((member) => member.id !== "you") }, "remove-person"), /current household member/);
  assert.equal(saved.pilot.members.length, 2);
  assert.equal(saved.pilot.profileFacts.length, 1);
});
