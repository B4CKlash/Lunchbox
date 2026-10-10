import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { householdStateSchema, type PilotOperation } from "@/lib/contracts";
import { applyHouseholdAction } from "@/features/meals/workspace-state";
import { aiJobRequestSchema, aiJobResultSchema } from "@/features/meals/jobs";
import { applyPilotCommand, ensurePilot, PilotCommandError } from "@/features/planning/pilot";
import { extractExplicitProfileChanges } from "@/features/planning/profile";
import { remoteCommandSchema, remoteHouseholdSchema, type RemoteCommand, type RemoteHousehold } from "@/features/pantry/remote-protocol";
import { authorizeHouseholdRequest, checkDatabaseError, HouseholdApiError, householdFailure, householdRequestBody, householdResponse, requireHouseholdMember } from "./server";

export async function readRemoteHousehold(db: SupabaseClient, householdId: string, userId?: string): Promise<RemoteHousehold> {
  const { data, error } = await db.from("households").select("id,revision,snapshot").eq("id", householdId).single();
  checkDatabaseError(error);
  if (!data) throw new HouseholdApiError(404, "household_not_found", "This shared household was not found.");
  const membership = userId ? await db.from("household_members").select("member_id").eq("household_id", householdId).eq("user_id", userId).single() : null;
  if (membership) checkDatabaseError(membership.error);
  return remoteHouseholdSchema.parse({ householdId: data.id, revision: data.revision, state: data.snapshot, ...(membership?.data?.member_id ? { currentMemberId: membership.data.member_id } : {}) });
}

/** Both local controls and remote commands run the same pure domain reducers. */
export function reduceRemoteCommand(current: RemoteHousehold, input: RemoteCommand) {
  if (input.householdId !== current.householdId) throw new HouseholdApiError(403, "not_authorized", "The action belongs to a different household.");
  if (input.expectedRevision !== current.revision) throw new HouseholdApiError(409, "conflict", "Your household changed on another device. Review the latest state before retrying.", current);
  const state = ensurePilot(current.state);
  if (state.pilot.revision !== current.revision) throw new HouseholdApiError(409, "revision_mismatch", "The saved household needs recovery before editing.", current);
  if (input.command.kind === "pilot") {
    if (input.command.command.expectedRevision !== current.revision)
      throw new HouseholdApiError(409, "conflict", "This action was prepared against an older household. Review it again.", current);
    const operation = input.command.command.operation;
    const changes = operation.type === "propose" ? operation.changes
      : operation.type === "receive_planning_result" ? operation.proposal?.changes ?? []
      : operation.type === "apply_proposal" ? state.pilot.proposals.find((proposal) => proposal.id === operation.proposalId)?.changes ?? [] : [operation];
    if (changes.some((change) => ["record_feedback", "upsert_profile_fact", "remove_profile_fact"].includes(change.type)) && !current.currentMemberId)
      throw new HouseholdApiError(409, "actor_unavailable", "This account needs a household person before saving preferences or feedback.");
    const result = applyPilotCommand(state, input.command.command, { actorMemberId: current.currentMemberId });
    if (result.duplicate) throw new HouseholdApiError(409, "command_id_reused", "Retry this action using its original request identifier.");
    return { state: result.state, receipt: result.receipt };
  }
  const next = applyHouseholdAction(state, input.command.action);
  if (next.pilot?.revision !== current.revision + 1) throw new HouseholdApiError(400, "invalid_request", "This action cannot be applied to the live household. Use the planning workspace.");
  return { state: next, receipt: { id: input.commandId, revision: current.revision + 1, summary: "Household updated." } };
}

/** A browser can resume a partner's response, but cannot author its evidence or effects. */
export function assertProfileResultJob(
  current: RemoteHousehold,
  operation: PilotOperation,
  row: Record<string, unknown> | null | undefined,
  sourceActorMemberId: string | undefined,
) {
  const source = operation.type === "receive_planning_result" ? operation.profileSource
    : operation.type === "receive_recipe_chat_result" ? {
      jobId: operation.jobId, request: operation.request, actorMemberId: operation.actorMemberId, changes: operation.result.profileChanges ?? [],
    } : undefined;
  if (!source) return;
  const request = aiJobRequestSchema.safeParse(row?.request);
  const result = aiJobResultSchema.safeParse(row?.result);
  const expectedKind = operation.type === "receive_recipe_chat_result" ? "chat" : "planning";
  if (!row || row.status !== "completed" || row.household_revision !== current.revision || row.session_id !== current.state.pilot?.session.id
    || sourceActorMemberId !== source.actorMemberId || !request.success || request.data.kind !== expectedKind
    || !result.success || result.data.kind !== expectedKind) {
    throw new HouseholdApiError(409, "invalid_profile_result", "This assistant response no longer matches the household or its original requester. Retry with the current kitchen.");
  }
  const message = request.data.kind === "planning" ? request.data.message : request.data.kind === "chat" ? request.data.input.message : "";
  const expected = extractExplicitProfileChanges(current.state, message, sourceActorMemberId!);
  const persistedChanges = result.data.kind === "planning" || result.data.kind === "chat" ? result.data.data.profileChanges ?? [] : [];
  const sourceMessage = operation.type === "receive_planning_result" ? operation.session.messages.find((entry) => entry.id === `job-${source.jobId}-user`) : undefined;
  if (message !== source.request || !isDeepStrictEqual(source.changes, expected) || !isDeepStrictEqual(persistedChanges, expected)
    || (operation.type === "receive_planning_result" && (sourceMessage?.role !== "user" || sourceMessage.authorMemberId !== source.actorMemberId || sourceMessage.text !== message))
    || (operation.type === "receive_recipe_chat_result" && (result.data.kind !== "chat" || !isDeepStrictEqual(operation.result, result.data.data)))) {
    throw new HouseholdApiError(409, "invalid_profile_result", "These saved preferences or conversation do not match the completed assistant request.");
  }
}

export async function applyRemoteCommand(db: SupabaseClient, userId: string, input: RemoteCommand) {
  await requireHouseholdMember(db, userId, input.householdId);
  const current = await readRemoteHousehold(db, input.householdId, userId);
  const previous = await db.from("household_commands").select("command,receipt").eq("household_id", input.householdId).eq("command_id", input.commandId).maybeSingle();
  checkDatabaseError(previous.error);
  if (previous.data) {
    // JSONB equality in the RPC is authoritative, including object key order.
    const retry = await db.rpc("lunchbox_apply_command", { p_household: input.householdId, p_user: userId, p_command_id: input.commandId, p_expected_revision: input.expectedRevision, p_command: input.command, p_snapshot: current.state, p_receipt: previous.data.receipt });
    checkDatabaseError(retry.error);
    return { ...retry.data, currentMemberId: current.currentMemberId };
  }
  const mutation = input.command;
  if (mutation.kind === "pilot" && current.state.pilot?.receipts.some((receipt) => receipt.commandId === mutation.command.id)) {
    // Browser migration preserves old receipts even though those commands were
    // applied before the database existed. A retried purchase stays a no-op.
    const duplicate = applyPilotCommand(current.state, mutation.command);
    if (duplicate.duplicate) return { ...current, receipt: duplicate.receipt, duplicate: true };
  }
  if (mutation.kind === "pilot" && ((mutation.command.operation.type === "receive_planning_result" && mutation.command.operation.profileSource)
    || mutation.command.operation.type === "receive_recipe_chat_result")) {
    const operation = mutation.command.operation;
    const jobId = operation.type === "receive_recipe_chat_result" ? operation.jobId
      : operation.type === "receive_planning_result" ? operation.profileSource!.jobId : "";
    const job = await db.from("household_ai_jobs").select("status,household_revision,session_id,requested_by,request,result").eq("household_id", input.householdId).eq("id", jobId).maybeSingle();
    checkDatabaseError(job.error);
    const actor = job.data ? await db.from("household_members").select("member_id").eq("household_id", input.householdId).eq("user_id", job.data.requested_by).maybeSingle() : null;
    if (actor) checkDatabaseError(actor.error);
    assertProfileResultJob(current, operation, job.data, actor?.data?.member_id);
  }
  if (mutation.kind === "pilot" && mutation.command.operation.type === "receive_planning_result" && mutation.command.operation.directPlacement) {
    const source = mutation.command.operation.directPlacement;
    const job = await db.from("household_ai_jobs").select("status,household_revision,session_id,requested_by,request,result").eq("household_id", input.householdId).eq("id", source.jobId).maybeSingle();
    checkDatabaseError(job.error);
    const request = aiJobRequestSchema.safeParse(job.data?.request);
    const result = aiJobResultSchema.safeParse(job.data?.result);
    const actor = job.data ? await db.from("household_members").select("member_id").eq("household_id", input.householdId).eq("user_id", job.data.requested_by).maybeSingle() : null;
    if (actor) checkDatabaseError(actor.error);
    if (!job.data || job.data.status !== "completed" || job.data.household_revision !== current.revision || job.data.session_id !== current.state.pilot?.session.id
      || actor?.data?.member_id !== source.actorMemberId || !request.success || request.data.kind !== "planning" || request.data.message !== source.request
      || !result.success || result.data.kind !== "planning" || !isDeepStrictEqual(result.data.data.operations, [source.change])) {
      throw new HouseholdApiError(409, "invalid_direct_placement", "This response cannot directly place a meal. Refresh it or review a planning proposal.");
    }
  }
  const result = reduceRemoteCommand(current, input);
  const { data, error } = await db.rpc("lunchbox_apply_command", {
    p_household: input.householdId, p_user: userId, p_command_id: input.commandId,
    p_expected_revision: input.expectedRevision, p_command: input.command,
    p_snapshot: result.state, p_receipt: result.receipt,
  });
  checkDatabaseError(error);
  if (data.conflict) throw new HouseholdApiError(409, "conflict", "Your household changed on another device. Review the latest state before retrying.", remoteHouseholdSchema.parse({ ...data, currentMemberId: current.currentMemberId }));
  return { ...data, currentMemberId: current.currentMemberId };
}

export async function householdGet(request: Request) {
  try {
    const { db, user } = await authorizeHouseholdRequest(request);
    const membership = await db.from("household_members").select("household_id").eq("user_id", user.id).maybeSingle();
    checkDatabaseError(membership.error);
    return householdResponse(membership.data ? await readRemoteHousehold(db, membership.data.household_id, user.id) : { household: null });
  } catch (error) { return householdFailure(error); }
}

export async function householdCreate(request: Request) {
  try {
    const { db, user } = await authorizeHouseholdRequest(request);
    const input = z.object({ name: z.string().trim().min(1).max(80), state: householdStateSchema }).parse(await householdRequestBody(request));
    const state = ensurePilot(input.state);
    // Preserve migration receipts and revision; retry safety survives import.
    const { data, error } = await db.rpc("lunchbox_create_household", { p_user: user.id, p_name: input.name, p_snapshot: state });
    checkDatabaseError(error);
    return householdResponse(remoteHouseholdSchema.parse(data), 201);
  } catch (error) { return householdFailure(error); }
}

export async function householdCommand(request: Request) {
  try {
    const { db, user } = await authorizeHouseholdRequest(request);
    const input = remoteCommandSchema.parse(await householdRequestBody(request));
    return householdResponse(await applyRemoteCommand(db, user.id, input));
  } catch (error) {
    if (error instanceof PilotCommandError) return householdResponse({ code: error.code, error: error.message }, error.code === "conflict" || error.code === "stale-proposal" ? 409 : 400);
    return householdFailure(error);
  }
}

export const hashInvitation = (token: string) => createHash("sha256").update(token).digest("hex");

export async function householdInvite(request: Request) {
  try {
    const { db, user } = await authorizeHouseholdRequest(request);
    const input = z.object({ householdId: z.uuid(), email: z.email().max(254) }).parse(await householdRequestBody(request));
    await requireHouseholdMember(db, user.id, input.householdId, true);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { error } = await db.from("household_invitations").insert({ token_hash: hashInvitation(token), household_id: input.householdId, email: input.email.toLowerCase(), invited_by: user.id, expires_at: expiresAt });
    checkDatabaseError(error);
    // Return the token once to the owner to share personally. No email is sent.
    return householdResponse({ token, expiresAt }, 201);
  } catch (error) { return householdFailure(error); }
}

export async function householdJoin(request: Request) {
  try {
    const { db, user } = await authorizeHouseholdRequest(request);
    const { token } = z.object({ token: z.string().regex(/^[\w-]{43}$/) }).parse(await householdRequestBody(request));
    const { data, error } = await db.rpc("lunchbox_accept_invitation", { p_token_hash: hashInvitation(token), p_user: user.id });
    checkDatabaseError(error);
    return householdResponse(await readRemoteHousehold(db, z.uuid().parse(data), user.id));
  } catch (error) { return householdFailure(error); }
}
