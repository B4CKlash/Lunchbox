import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSampleHousehold } from "@/features/pantry/seed";
import { ensurePilot } from "@/features/planning/pilot";
import { remoteCommandSchema } from "@/features/pantry/remote-protocol";
import { authorizeHouseholdRequest, HouseholdApiError, requireHouseholdMember } from "./server";
import { reduceRemoteCommand, hashInvitation } from "./server-household";

const householdId = "37c631af-22a3-455c-a598-eeb2a1d14ea1";
const commandId = "37c631af-22a3-455c-a598-eeb2a1d14ea2";
const current = () => ({ householdId, revision: 0, state: ensurePilot(createSampleHousehold(), "2026-10-08") });
const command = () => remoteCommandSchema.parse({ householdId, commandId, expectedRevision: 0, command: { kind: "pilot", command: { id: commandId, expectedRevision: 0, operation: { type: "set_shop_through", date: "2026-10-15" } } } });

test("remote command requires household identity and current revision before domain mutation", () => {
  const initial = current();
  assert.throws(() => reduceRemoteCommand(initial, { ...command(), householdId: commandId }), (error) => error instanceof HouseholdApiError && error.status === 403);
  assert.throws(() => reduceRemoteCommand(initial, { ...command(), expectedRevision: 1 }), (error) => error instanceof HouseholdApiError && error.code === "conflict" && error.details === initial);
  assert.equal(initial.state.pilot.revision, 0);
  const result = reduceRemoteCommand(initial, command());
  assert.equal(result.state.pilot?.revision, 1);
  assert.equal(result.state.pilot?.shopThrough, "2026-10-15");
  assert.deepEqual(result.state.pantry, initial.state.pantry);
});

test("remote legacy controls use one revision and cannot replace a snapshot", () => {
  const initial = current();
  assert.equal(remoteCommandSchema.safeParse({ ...command(), command: { kind: "legacy", action: { type: "replace", state: initial.state } } }).success, false);
  const input = remoteCommandSchema.parse({ ...command(), command: { kind: "legacy", action: { type: "setChatDraft", text: "A quick lunch" } } });
  const result = reduceRemoteCommand(initial, input);
  assert.equal(result.state.pilot?.revision, 1);
  assert.equal(result.state.workspace.chatDraft, "A quick lunch");
});

test("authentication verifies tokens with Supabase and rejects missing or invalid tokens", async () => {
  let received: string | undefined;
  const db = { auth: { getUser: async (token: string) => { received = token; return { data: { user: token === "valid" ? { id: "actor" } : null }, error: token === "valid" ? null : new Error("expired") }; } } } as unknown as SupabaseClient;
  await assert.rejects(authorizeHouseholdRequest(new Request("http://localhost"), db), (error) => error instanceof HouseholdApiError && error.status === 401);
  await assert.rejects(authorizeHouseholdRequest(new Request("http://localhost", { headers: { Authorization: "Bearer invalid" } }), db));
  const result = await authorizeHouseholdRequest(new Request("http://localhost", { headers: { Authorization: "Bearer valid" } }), db);
  assert.equal(received, "valid");
  assert.equal(result.user.id, "actor");
});

test("membership checks reject nonmembers and prevent members issuing invitations", async () => {
  let role: string | null = null;
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: role ? { role } : null, error: null }) };
  const db = { from: () => query } as unknown as SupabaseClient;
  await assert.rejects(requireHouseholdMember(db, "actor", householdId), (error) => error instanceof HouseholdApiError && error.status === 403);
  role = "member";
  await requireHouseholdMember(db, "actor", householdId);
  await assert.rejects(requireHouseholdMember(db, "actor", householdId, true));
  role = "owner";
  await requireHouseholdMember(db, "actor", householdId, true);
});

test("invitation storage contains a stable digest, never the bearer token", () => {
  const token = "private-partner-invitation-token";
  assert.match(hashInvitation(token), /^[a-f0-9]{64}$/);
  assert.notEqual(hashInvitation(token), token);
  assert.equal(hashInvitation(token), hashInvitation(token));
});
