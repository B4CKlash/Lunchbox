import assert from "node:assert/strict";
import test from "node:test";
import type { PilotOperation } from "@/lib/contracts";
import { createSampleHousehold } from "@/features/pantry/seed";
import { ensurePilot } from "@/features/planning/pilot";
import { remoteCommandSchema } from "@/features/pantry/remote-protocol";
import { reduceRemoteCommand } from "./server-household";

const householdId = "37c631af-22a3-455c-a598-eeb2a1d14ea1";
const commandId = "37c631af-22a3-455c-a598-eeb2a1d14ea2";
const current = () => ({ householdId, revision: 0, state: ensurePilot(createSampleHousehold(), "2026-10-08") });
const command = (operation: PilotOperation, revision = 0, id = commandId) => remoteCommandSchema.parse({
  householdId, commandId, expectedRevision: revision,
  command: { kind: "pilot", command: { id, expectedRevision: revision, operation } },
});
const feedback = (id = "new", memberId?: string) => ({
  type: "record_feedback" as const,
  feedback: { id, recipeId: "pasta", rating: 4, makeAgain: true, notes: "My opinion", ...(memberId ? { memberId } : {}) },
});

test("shared feedback requires an authenticated household person and rejects another person's attribution", () => {
  const initial = current();
  for (const change of [feedback(), feedback("forged", "you")]) {
    for (const operation of [change,
      { type: "propose" as const, id: "proposal", title: "My feedback", changes: [change] },
      { type: "receive_planning_result" as const, baseRevision: 0, session: initial.state.pilot.session,
        proposal: { id: "proposal", title: "My feedback", changes: [change] } },
    ]) {
      assert.throws(() => reduceRemoteCommand(initial, command(operation)), /household person/);
      if (change.feedback.memberId) assert.throws(() => reduceRemoteCommand({ ...initial, currentMemberId: "partner" }, command(operation)), /person making this request/);
    }
  }
  assert.deepEqual(initial.state.pilot.feedback, []);
});

test("shared feedback is stamped from the authenticated person and accepted proposals retain their original author", () => {
  const initial = current();
  const actor = { ...initial, currentMemberId: "you" };
  const direct = reduceRemoteCommand(actor, command(feedback()));
  assert.equal(direct.state.pilot?.feedback[0].memberId, "you");
  for (const operation of [
    { type: "propose" as const, id: "proposal", title: "My feedback", changes: [feedback()] },
    { type: "receive_planning_result" as const, baseRevision: 0, session: initial.state.pilot.session,
      proposal: { id: "proposal", title: "My feedback", changes: [feedback()] } },
  ]) {
    const proposed = reduceRemoteCommand(actor, command(operation));
    assert.equal(proposed.state.pilot?.proposals[0].changes[0].type, "record_feedback");
    const pending = { ...initial, revision: 1, state: proposed.state };
    assert.throws(() => reduceRemoteCommand(pending, command({ type: "apply_proposal", proposalId: "proposal" }, 1, "apply")), /household person/);
    const accepted = reduceRemoteCommand({ ...pending, currentMemberId: "partner" }, command({ type: "apply_proposal", proposalId: "proposal" }, 1, "apply"));
    assert.equal(accepted.state.pilot?.feedback[0].memberId, "you");
  }
  assert.deepEqual(initial.state.pilot.feedback, []);
});

test("shared feedback IDs cannot take another person's or legacy opinion through direct or proposed edits", () => {
  const initial = current();
  initial.state.pilot.feedback = [
    { ...feedback("owner-opinion", "you").feedback, rating: 1 },
    { ...feedback("legacy-opinion").feedback, rating: 3 },
    { ...feedback("partner-opinion", "partner").feedback, rating: 5 },
  ];
  const actor = { ...initial, currentMemberId: "partner" };
  const before = structuredClone(initial.state);
  for (const id of ["owner-opinion", "legacy-opinion"]) {
    const change = feedback(id);
    for (const operation of [change,
      { type: "propose" as const, id: "proposal", title: "Replace opinion", changes: [change] },
      { type: "receive_planning_result" as const, baseRevision: 0, session: initial.state.pilot.session,
        proposal: { id: "proposal", title: "Replace opinion", changes: [change] } },
    ]) assert.throws(() => reduceRemoteCommand(actor, command(operation)), /feedback ID belongs/);
    assert.deepEqual(initial.state, before);
  }
  const own = reduceRemoteCommand(actor, command(feedback("partner-opinion")));
  assert.equal(own.state.pilot?.feedback.find((entry) => entry.id === "partner-opinion")?.rating, 4);
  assert.deepEqual(own.state.pilot?.feedback.filter((entry) => entry.id !== "partner-opinion"), before.pilot.feedback.filter((entry) => entry.id !== "partner-opinion"));
  const opposing = reduceRemoteCommand(actor, command(feedback("new-opinion")));
  assert.equal(opposing.state.pilot?.feedback.length, 4);
  assert.deepEqual(opposing.state.pilot?.feedback.slice(0, 3), before.pilot.feedback);
  const recovered = structuredClone(actor);
  recovered.state.pilot.proposals.push({ id: "recovered-proposal", title: "Earlier proposal", baseRevision: 0, status: "pending",
    changes: [feedback("owner-opinion", "partner")] });
  assert.throws(() => reduceRemoteCommand(recovered, command({ type: "apply_proposal", proposalId: "recovered-proposal" })), /feedback ID belongs/);
  assert.deepEqual(recovered.state.pilot.feedback, before.pilot.feedback);
});
