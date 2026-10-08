import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "./seed";
import { applyPilotCommand, ensurePilot } from "@/features/planning/pilot";
import { applyHouseholdAction } from "@/features/meals/workspace-state";
import { remoteCommandSchema } from "./remote-protocol";
import { canReadHouseholdCache, checkQueuedMutationRevision, rebaseRemoteCommand } from "./remote-conflicts";

const base = { householdId: "37c631af-22a3-455c-a598-eeb2a1d14ea1", commandId: "37c631af-22a3-455c-a598-eeb2a1d14ea2", expectedRevision: 3 };
test("pantry, preference, and full-session conflicts cannot overwrite another member's newer changes", () => {
  const household = ensurePilot(createSampleHousehold());
  const commands = [
    { kind: "legacy", action: { type: "setPantry", pantry: household.pantry } },
    { kind: "legacy", action: { type: "setPreferences", preferences: household.preferences } },
    { kind: "pilot", command: { id: base.commandId, expectedRevision: 3, operation: { type: "set_session", session: household.pilot.session } } },
    { kind: "pilot", command: { id: base.commandId, expectedRevision: 3, operation: { type: "receive_planning_result", baseRevision: 3, session: household.pilot.session } } },
    { kind: "pilot", command: { id: base.commandId, expectedRevision: 3, operation: { type: "set_members", members: household.pilot.members } } },
  ];
  for (const command of commands) assert.equal(rebaseRemoteCommand(remoteCommandSchema.parse({ ...base, command }), 4), null);
});

test("explicit additive purchase retry preserves its identity and updates both revision guards", () => {
  const input = remoteCommandSchema.parse({ ...base, command: { kind: "pilot", command: { id: base.commandId, expectedRevision: 3, operation: { type: "record_purchase", items: [{ ingredientId: "rice", name: "Rice", quantity: 200, unit: "g" }] } } } });
  const retry = rebaseRemoteCommand(input, 4);
  assert.ok(retry); assert.equal(retry.commandId, input.commandId); assert.equal(retry.expectedRevision, 4);
  assert.equal(retry.command.kind, "pilot");
  if (retry.command.kind === "pilot") { assert.equal(retry.command.command.id, input.commandId); assert.equal(retry.command.command.expectedRevision, 4); }
  assert.equal(input.expectedRevision, 3);
});

test("cached household data is only readable by its signed-in account", () => {
  assert.equal(canReadHouseholdCache({ ownerId: "owner", householdId: base.householdId }, "owner"), true);
  assert.equal(canReadHouseholdCache({ ownerId: "owner", householdId: base.householdId }, "partner"), false);
  assert.equal(canReadHouseholdCache({ ownerId: "owner", householdId: base.householdId }, null), false);
  assert.equal(canReadHouseholdCache({ ownerId: null, householdId: base.householdId }, null), false);
  assert.equal(canReadHouseholdCache({ ownerId: null, householdId: null }, "owner"), true);
});

test("two queued snapshot edits cannot use fresh revisions to erase the earlier saved edit", () => {
  const original = ensurePilot(createSampleHousehold());
  const first = { id: "first", expectedRevision: 0, operation: { type: "set_session" as const, session: { ...original.pilot.session, focusDate: "2026-10-15" } } };
  const staleSecond = { id: "second", expectedRevision: 1, operation: { type: "set_session" as const, session: { ...original.pilot.session, draft: "New draft from the original render" } } };
  const current = applyPilotCommand(original, first).state;
  assert.throws(() => checkQueuedMutationRevision({ kind: "pilot", command: staleSecond }, original.pilot.revision, current.pilot.revision), /newer changes were kept/);
  assert.equal(current.pilot.session.focusDate, "2026-10-15");
  const pantryEdit = { type: "setPantry" as const, pantry: original.pantry.map((item, index) => index === 0 ? { ...item, quantity: 100 } : item) };
  const refreshed = applyHouseholdAction(current, { type: "setPantry", pantry: current.pantry.map((item, index) => index === 1 ? { ...item, quantity: 444 } : item) });
  assert.throws(() => checkQueuedMutationRevision({ kind: "legacy", action: pantryEdit }, current.pilot.revision, refreshed.pilot!.revision), /newer changes were kept/);
  assert.equal(refreshed.pantry[1].quantity, 444);
  assert.doesNotThrow(() => checkQueuedMutationRevision({ kind: "pilot", command: { id: "purchase", expectedRevision: 2, operation: { type: "record_purchase", items: [{ ingredientId: "rice", name: "Rice", unit: "g", quantity: 50 }] } } }, 1, 2));
});
