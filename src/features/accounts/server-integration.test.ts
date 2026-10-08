import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createSampleHousehold } from "@/features/pantry/seed";
import { ensurePilot, applyPilotCommand } from "@/features/planning/pilot";
import { householdCommand, householdCreate, householdGet, householdInvite, householdJoin } from "./server-household";
import { aiWorkerRequest, cancelAiJob, enqueueAiJob, getAiJob } from "@/features/meals/jobs-server";
import { createPlanningRefreshMessage } from "@/features/meals/planning-refresh";

// Explicitly opt in. These tests create/delete disposable users in LOCAL Supabase
// only. Normal checks have no credentials and make no database/network changes.
const enabled = process.env.LUNCHBOX_INTEGRATION_TESTS === "1";
test("local Supabase proves household authorization, CAS, invitations and worker lifecycle", { skip: !enabled }, async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Integration tests must never use hosted projects.");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const users: string[] = [];
  const householdIds: string[] = [];
  const createUser = async (label: string) => {
    const email = `pilot-${label}-${randomUUID()}@example.test`;
    const password = `Pilot-${randomUUID()}!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.equal(created.error, null); assert.ok(created.data.user);
    users.push(created.data.user.id);
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    assert.equal(login.error, null); assert.ok(login.data.session);
    return { id: created.data.user.id, email, token: login.data.session.access_token, client };
  };
  t.after(async () => {
    for (const householdId of householdIds) {
      const result = await admin.from("households").delete().eq("id", householdId);
      assert.equal(result.error, null);
    }
    for (const id of users) assert.equal((await admin.auth.admin.deleteUser(id)).error, null);
  });
  const owner = await createUser("owner");
  const partner = await createUser("partner");
  const stranger = await createUser("stranger");
  const request = (token: string, body?: unknown, path = "/api/household", method?: string) => new Request(`http://localhost:3100${path}`, { method: method ?? (body === undefined ? "GET" : "POST"), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let revision = 0;
  const getLatest = async () => {
    const response = await householdGet(request(owner.token));
    assert.equal(response.status, 200);
    const data = await response.json(); revision = data.revision;
    return data;
  };
  let state = ensurePilot(createSampleHousehold(), "2026-10-08");
  const migratedCommand = { id: randomUUID(), expectedRevision: 0, operation: { type: "set_shop_through" as const, date: "2026-10-15" } };
  state = applyPilotCommand(state, migratedCommand).state;
  const created = await householdCreate(request(owner.token, { name: "Disposable test household", state }));
  assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
  const initial = await created.json(); const householdId: string = initial.householdId; householdIds.push(householdId); revision = initial.revision;
  assert.equal(revision, 1, "import preserves pilot revision");
  assert.equal(initial.state.pilot.receipts.length, 1, "import preserves idempotency receipts");
  assert.equal(initial.currentMemberId, initial.state.pilot.members[0].id);
  const envelope = (date: string) => ({ householdId, expectedRevision: revision, commandId: randomUUID(), command: { kind: "pilot", command: { id: randomUUID(), expectedRevision: revision, operation: { type: "set_shop_through", date } } } });

  await t.test("unauthenticated table access and nonmember command execution are denied", async () => {
    assert.equal((await householdGet(new Request("http://localhost"))).status, 401);
    assert.equal((await householdCommand(request(stranger.token, envelope("2026-10-16")))).status, 403);
    const direct = await stranger.client.from("households").select("*");
    assert.ok(direct.error || direct.data?.length === 0);
    assert.ok((await stranger.client.rpc("lunchbox_create_household", { p_user: stranger.id, p_name: "Bypass", p_snapshot: state })).error);
    const unauthorizedRpc = await admin.rpc("lunchbox_apply_command", { p_household: householdId, p_user: stranger.id, p_command_id: randomUUID(), p_expected_revision: revision, p_command: {}, p_snapshot: state, p_receipt: {} });
    assert.equal(unauthorizedRpc.error?.code, "42501");
  });

  await t.test("migrated command retries do not change revision or repeat side effects", async () => {
    const response = await householdCommand(request(owner.token, { householdId, expectedRevision: 0, commandId: randomUUID(), command: { kind: "pilot", command: migratedCommand } }));
    assert.equal(response.status, 200); const data = await response.json();
    assert.equal(data.duplicate, true); assert.equal(data.revision, 1);
  });

  await t.test("concurrent edits have one winner, expose the latest snapshot, and retry once", async () => {
    const first = envelope("2026-10-17"); const second = envelope("2026-10-18");
    const responses = await Promise.all([householdCommand(request(owner.token, first)), householdCommand(request(owner.token, second))]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const winnerIndex = responses.findIndex((r) => r.status === 200);
    const winner = winnerIndex === 0 ? first : second;
    const conflict = await responses[1 - winnerIndex].json();
    assert.equal(conflict.latest.revision, 2);
    const retried = await householdCommand(request(owner.token, winner));
    assert.equal(retried.status, 200); assert.equal((await retried.json()).duplicate, true);
    winner.command.command.operation.date = "2026-10-20";
    assert.equal((await householdCommand(request(owner.token, winner))).status, 409);
    await getLatest(); assert.equal(revision, 2);
  });

  await t.test("invitation is owner-only, verified-email-bound, expiring and retry-safe", async () => {
    const invited = await householdInvite(request(owner.token, { householdId, email: partner.email }));
    assert.equal(invited.status, 201); const invitation = await invited.json();
    assert.equal((await householdJoin(request(stranger.token, { token: invitation.token }))).status, 403);
    assert.equal((await householdJoin(request(partner.token, { token: invitation.token }))).status, 200);
    assert.equal((await householdJoin(request(partner.token, { token: invitation.token }))).status, 200);
    assert.equal((await householdInvite(request(partner.token, { householdId, email: stranger.email }))).status, 403);
    const partnerHousehold = await (await householdGet(request(partner.token))).json();
    assert.equal(partnerHousehold.householdId, householdId);
    assert.equal(partnerHousehold.currentMemberId, initial.state.pilot.members[1].id);
    const expired = await (await householdInvite(request(owner.token, { householdId, email: stranger.email }))).json();
    await admin.from("household_invitations").update({ expires_at: "2020-01-01T00:00:00Z" }).eq("email", stranger.email);
    assert.equal((await householdJoin(request(stranger.token, { token: expired.token }))).status, 403);
  });

  process.env.LUNCHBOX_WORKER_HOUSEHOLD_ID = householdId;
  process.env.LUNCHBOX_WORKER_TOKEN = randomUUID() + randomUUID();
  const worker = (body: unknown) => aiWorkerRequest(request(process.env.LUNCHBOX_WORKER_TOKEN!, body));
  const enqueue = async (message = "Plan a lunch.") => {
    const latest = await getLatest();
    const input = { id: randomUUID(), householdId, expectedRevision: revision, sessionId: latest.state.pilot.session.id, request: { kind: "planning", message } };
    const response = await enqueueAiJob(request(owner.token, input));
    assert.equal(response.status, 202, JSON.stringify(await response.clone().json()));
    return { input, ...(await response.json()) };
  };
  const claim = async () => {
    const response = await worker({ action: "claim" });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    return (await response.json()).job;
  };
  const result = { kind: "planning", data: { reply: "Here is a candidate; no calendar changes were applied.", recipes: [], operations: [] } };
  await t.test("offline visibility, coalescing and cancellation prevent late completion", async () => {
    const a = await enqueue(); assert.equal(a.workerOnline, false);
    const b = await enqueue("Replace the previous request.");
    const old = await getAiJob(request(owner.token, undefined, `/api/household/jobs?householdId=${householdId}&id=${a.input.id}`));
    assert.equal((await old.json()).job.status, "cancelled");
    const job = await claim(); assert.equal(job.id, b.input.id);
    assert.equal((await (await worker({ action: "heartbeat", jobId: job.id, leaseToken: job.leaseToken })).json()).active, true);
    assert.equal((await cancelAiJob(request(partner.token, { householdId, id: job.id }, undefined, "DELETE"))).status, 200);
    assert.equal((await worker({ action: "complete", jobId: job.id, leaseToken: job.leaseToken, result })).status, 409);
  });

  await t.test("worker interruption reclaims with a new lease, rejects stale owner, deduplicates completion", async () => {
    const queued = await enqueue(); assert.equal(queued.workerOnline, true);
    const original = await claim();
    await admin.from("household_ai_jobs").update({ lease_expires_at: "2020-01-01T00:00:00Z" }).eq("id", original.id);
    const replacement = await claim(); assert.equal(replacement.id, original.id); assert.notEqual(replacement.leaseToken, original.leaseToken);
    assert.equal((await worker({ action: "complete", jobId: original.id, leaseToken: original.leaseToken, result })).status, 409);
    const completion = { action: "complete", jobId: replacement.id, leaseToken: replacement.leaseToken, result };
    assert.equal((await (await worker(completion)).json()).job.status, "completed");
    assert.equal((await (await worker(completion)).json()).job.status, "completed");
    assert.equal((await worker({ ...completion, result: { ...result, data: { ...result.data, reply: "Different output" } } })).status, 409);
    const retryQueue = await enqueueAiJob(request(owner.token, queued.input));
    assert.equal((await retryQueue.json()).job.status, "completed");
  });

  await t.test("household edits mark late results stale and invalid proposed actions cannot finish", async () => {
    await enqueue(); const job = await claim();
    const invalid = await worker({ action: "complete", jobId: job.id, leaseToken: job.leaseToken, result: { kind: "planning", data: { reply: "Invalid", recipes: [], operations: [{ type: "remove_batch", batchId: "missing" }] } } });
    assert.equal(invalid.status, 400);
    assert.equal((await householdCommand(request(owner.token, envelope("2026-10-21")))).status, 200);
    const completed = await worker({ action: "complete", jobId: job.id, leaseToken: job.leaseToken, result });
    assert.equal(completed.status, 200); assert.equal((await completed.json()).job.status, "stale");
  });

  await t.test("three interrupted attempts fail visibly and latest-session lookup resumes without a new revision", async () => {
    const queued = await enqueue();
    const expectedRevision = revision;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const job = await claim(); assert.equal(job.id, queued.input.id); assert.equal(job.attempts, attempt);
      const expired = await admin.from("household_ai_jobs").update({ lease_expires_at: "2020-01-01T00:00:00Z" }).eq("id", job.id);
      assert.equal(expired.error, null);
    }
    assert.equal(await claim(), null);
    const response = await getAiJob(request(owner.token, undefined, `/api/household/jobs?householdId=${householdId}&sessionId=${encodeURIComponent(queued.input.sessionId)}`));
    const resumed = await response.json(); assert.equal(resumed.job.id, queued.input.id); assert.equal(resumed.job.status, "failed");
    assert.match(resumed.job.error, /worker stopped/i);
    const extractionId = randomUUID();
    const extraction = await enqueueAiJob(request(owner.token, { ...queued.input, id: extractionId, request: { kind: "extract", input: { kind: "text", text: "A recipe to review separately." } } }));
    assert.equal(extraction.status, 202);
    const planningOnly = await getAiJob(request(partner.token, undefined, `/api/household/jobs?householdId=${householdId}&sessionId=${encodeURIComponent(queued.input.sessionId)}&kind=planning`));
    assert.equal((await planningOnly.json()).job.id, queued.input.id, "a newer recipe import cannot hide the resumable planning request");
    assert.equal((await cancelAiJob(request(owner.token, { householdId, id: extractionId }, undefined, "DELETE"))).status, 200);
    await getLatest(); assert.equal(revision, expectedRevision);
    const missing = await getAiJob(request(owner.token, undefined, `/api/household/jobs?householdId=${householdId}&sessionId=absent`));
    assert.equal((await missing.json()).job, null);
  });

  await t.test("the requesting partner has a stable actor identity and assigned people cannot be removed", async () => {
    const latest = await getLatest();
    const input = { id: randomUUID(), householdId, expectedRevision: revision, sessionId: latest.state.pilot.session.id, request: { kind: "planning", message: "Cover only my lunch." }, actorMemberId: initial.currentMemberId };
    const enqueued = await enqueueAiJob(request(partner.token, input)); assert.equal(enqueued.status, 202);
    const job = await claim(); assert.equal(job.id, input.id);
    assert.equal(job.actorMemberId, initial.state.pilot.members[1].id, "client cannot claim the owner's person identity");
    assert.notEqual(job.actorMemberId, initial.currentMemberId);
    const changed = structuredClone(latest.state);
    changed.pilot.members = [changed.pilot.members[0]];
    const direct = await admin.rpc("lunchbox_apply_command", { p_household: householdId, p_user: owner.id, p_command_id: randomUUID(), p_expected_revision: revision, p_command: {}, p_snapshot: changed, p_receipt: {} });
    assert.equal(direct.error?.code, "22004", "database preserves account/person bindings even if the server regresses");
  });

  await t.test("another member's automatic refresh defers to an active manual request without cancelling it", async () => {
    const manual = await enqueue("Keep this explicit manual request.");
    const deferredInput = { ...manual.input, id: randomUUID(), request: { kind: "planning", message: createPlanningRefreshMessage(["partner changed a preference"]) } };
    const refresh = await enqueueAiJob(request(partner.token, deferredInput));
    assert.equal(refresh.status, 202);
    const deferred = await refresh.json(); assert.equal(deferred.deferred, true); assert.equal(deferred.job.id, manual.input.id); assert.equal(deferred.job.status, "queued");
    assert.equal(deferred.job.actorMemberId, initial.currentMemberId);
    assert.equal((await admin.from("household_ai_jobs").select("id").eq("id", deferredInput.id)).data?.length, 0, "deferred refresh creates no competing job");
    const claimed = await claim(); assert.equal(claimed.id, manual.input.id);
    const running = await (await enqueueAiJob(request(partner.token, deferredInput))).json(); assert.equal(running.deferred, true); assert.equal(running.job.status, "running");
    await cancelAiJob(request(owner.token, { householdId, id: manual.input.id }, undefined, "DELETE"));
    const queued = await (await enqueueAiJob(request(partner.token, deferredInput))).json(); assert.equal(queued.deferred, undefined); assert.equal(queued.job.id, deferredInput.id);
    await cancelAiJob(request(partner.token, { householdId, id: deferredInput.id }, undefined, "DELETE"));
  });

  await t.test("direct placement requires a genuine completed job and atomically saves a retry-safe receipt", async () => {
    let latest = await getLatest();
    const recipe = { id: "direct-pasta", name: "Direct pasta", description: "A candidate", servings: 2, minutes: 20, ingredients: [{ ingredientId: "pasta", name: "Pasta", quantity: 200, unit: "g" }], steps: ["Cook pasta."] };
    const session = { ...latest.state.pilot.session, startDate: "2026-10-12", days: 7, focusDate: "2026-10-13", focusSlot: "lunch", focusedRecipeId: recipe.id, candidates: [recipe] };
    const sendOperation = (operation: unknown, commandId = randomUUID()) => ({ householdId, expectedRevision: revision, commandId, command: { kind: "pilot", command: { id: commandId, expectedRevision: revision, operation } } });
    assert.equal((await householdCommand(request(owner.token, sendOperation({ type: "set_session", session })))).status, 200);
    latest = await getLatest();
    const queued = await enqueue("Put this on 2026-10-13 lunch for me.");
    const job = await claim(); assert.equal(job.id, queued.input.id);
    const placement = { type: "create_batch", batch: { id: "direct-batch", recipe, prepareDate: "2026-10-13", yield: 1, reservedExtra: 0 }, allocations: [{ id: "direct-meal", batchId: "direct-batch", memberId: initial.currentMemberId, date: "2026-10-13", slot: "lunch", portions: 1 }] };
    const complete = await worker({ action: "complete", jobId: job.id, leaseToken: job.leaseToken, result: { kind: "planning", data: { reply: "Here is the requested placement.", recipes: [], operations: [placement] } } });
    assert.equal(complete.status, 200);
    const resumed = await (await getAiJob(request(partner.token, undefined, `/api/household/jobs?householdId=${householdId}&sessionId=${encodeURIComponent(job.sessionId)}&kind=planning`))).json();
    assert.equal(resumed.job.id, job.id); assert.equal(resumed.job.actorMemberId, initial.currentMemberId, "the partner resumes the original requester's identity");
    const directPlacement = { jobId: job.id, request: queued.input.request.message, actorMemberId: initial.currentMemberId, change: placement };
    const operation = { type: "receive_planning_result", baseRevision: revision, session: { ...latest.state.pilot.session, messages: [...latest.state.pilot.session.messages, { id: `job-${job.id}-assistant`, role: "assistant", text: "Requested placement", recipes: [], servings: 2 }] }, directPlacement };
    for (const forged of [{ ...directPlacement, jobId: randomUUID() }, { ...directPlacement, actorMemberId: initial.state.pilot.members[1].id }, { ...directPlacement, request: "Put this on Friday lunch for me." }, { ...directPlacement, change: { ...placement, batch: { ...placement.batch, yield: 2 } } }]) {
      assert.equal((await householdCommand(request(owner.token, sendOperation({ ...operation, directPlacement: forged })))).status, 409);
    }
    const originalRevision = revision;
    const envelope = sendOperation(operation);
    const accepted = await householdCommand(request(partner.token, envelope)); assert.equal(accepted.status, 200, JSON.stringify(await accepted.clone().json()));
    const saved = await accepted.json(); assert.equal(saved.revision, originalRevision + 1); assert.equal(saved.state.pilot.batches.find((batch: { id: string }) => batch.id === "direct-batch").yield, 1); assert.ok(saved.receipt.inverse);
    assert.equal(saved.state.pilot.session.messages.at(-1).id, `job-${job.id}-assistant`);
    assert.equal(saved.state.pilot.allocations.find((entry: { id: string }) => entry.id === "direct-meal").memberId, initial.currentMemberId, "resumption cannot turn the owner's 'me' into the applying partner");
    assert.equal((await (await householdCommand(request(owner.token, envelope))).json()).duplicate, true);
    await getLatest();
    const undo = await householdCommand(request(owner.token, sendOperation({ type: "undo", receiptId: saved.receipt.id }))); assert.equal(undo.status, 200);
    assert.equal((await undo.json()).state.pilot.batches.some((batch: { id: string }) => batch.id === "direct-batch"), false);
    await getLatest();
    assert.equal((await householdCommand(request(partner.token, sendOperation(operation)))).status, 409, "a fresh envelope cannot revive an old source job revision");
    assert.equal((await getLatest()).state.pilot.batches.some((batch: { id: string }) => batch.id === "direct-batch"), false);
  });
});
