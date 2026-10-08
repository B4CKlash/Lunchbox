import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizeHouseholdRequest, checkDatabaseError, getHouseholdDatabase, HouseholdApiError, householdFailure, householdRequestBody, householdResponse, requireHouseholdMember } from "@/features/accounts/server";
import { readRemoteHousehold } from "@/features/accounts/server-household";
import { applyPilotCommand } from "@/features/planning/pilot";
import { aiJobSchema, claimedAiJobSchema, enqueueAiJobSchema, isWorkerOnline, publicAiJob, workerActionSchema, type AiJobResult, type ClaimedAiJob } from "./jobs";
import { claimsCompletedAction, favoriteClaimFacts } from "./planning-claims";
import { findPlanningFavorites } from "./planning-fixtures";

export function authorizeWorker(request: Request, env: Record<string, string | undefined> = process.env) {
  const configured = env.LUNCHBOX_WORKER_TOKEN;
  const householdId = env.LUNCHBOX_WORKER_HOUSEHOLD_ID;
  if (!configured || configured.length < 32 || !z.uuid().safeParse(householdId).success)
    throw new HouseholdApiError(503, "worker_unconfigured", "The local AI worker is not configured.");
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!supplied || supplied.length > 8192 || !timingSafeEqual(digest(supplied), digest(configured)))
    throw new HouseholdApiError(401, "worker_not_authorized", "The local worker credential is invalid.");
  return householdId as string;
}

export function validateAiJobResult(job: ClaimedAiJob, result: AiJobResult) {
  if (job.kind !== result.kind) throw new HouseholdApiError(400, "invalid_result", "The worker returned the wrong kind of result.");
  const favoriteFacts = result.kind === "planning" ? favoriteClaimFacts(findPlanningFavorites(job.context), result.data) : [];
  if ((result.kind === "planning" || result.kind === "chat") && claimsCompletedAction(result.data.reply, favoriteFacts)) throw new HouseholdApiError(400, "invalid_result", "The worker claimed an action was completed without a household receipt.");
  if (result.kind !== "planning") return result;
  let state = job.context;
  // Preview only. Actual changes must be accepted through /commands.
  for (const [index, operation] of result.data.operations.entries()) {
    state = applyPilotCommand(state, { id: `job-preview-${job.id}-${index}`, expectedRevision: state.pilot?.revision ?? 0, operation }).state;
  }
  return result;
}

async function claimDetails(db: SupabaseClient, row: Record<string, unknown>) {
  const membership = await db.from("household_members").select("member_id").eq("household_id", row.household_id).eq("user_id", row.requested_by).maybeSingle();
  checkDatabaseError(membership.error);
  if (!membership.data?.member_id) throw new HouseholdApiError(409, "actor_unavailable", "The requesting account is no longer mapped to a household person.");
  return claimedAiJobSchema.parse({ ...publicAiJob(row), context: row.context, actorMemberId: membership.data.member_id, leaseToken: row.lease_token, leaseExpiresAt: row.lease_expires_at });
}

async function publicJobWithActor(db: SupabaseClient, row: Record<string, unknown>) {
  const actor = await db.from("household_members").select("member_id").eq("household_id", row.household_id).eq("user_id", row.requested_by).maybeSingle();
  checkDatabaseError(actor.error);
  return { ...publicAiJob(row), ...(actor.data?.member_id ? { actorMemberId: actor.data.member_id } : {}) };
}

export async function enqueueAiJob(request: Request) {
  try {
    const { db, user } = await authorizeHouseholdRequest(request);
    const input = enqueueAiJobSchema.parse(await householdRequestBody(request));
    await requireHouseholdMember(db, user.id, input.householdId);
    const household = await readRemoteHousehold(db, input.householdId, user.id);
    if (!household.currentMemberId) throw new HouseholdApiError(409, "actor_unavailable", "This account needs a household person before using the assistant.");
    if (household.state.pilot?.session.id !== input.sessionId) throw new HouseholdApiError(409, "stale_session", "This planning session changed. Refresh and try again.");
    const { data, error } = await db.rpc("lunchbox_enqueue_job", { p_id: input.id, p_household: input.householdId, p_user: user.id, p_session: input.sessionId, p_revision: input.expectedRevision, p_kind: input.request.kind, p_request: input.request });
    checkDatabaseError(error);
    if (data.conflict) throw new HouseholdApiError(409, "conflict", "The household changed before the request was queued. Refresh and retry.", household);
    const worker = await db.from("household_ai_workers").select("last_seen_at").eq("household_id", input.householdId).maybeSingle();
    checkDatabaseError(worker.error);
    return householdResponse({ job: await publicJobWithActor(db, data.deferred ? data.job : data), workerOnline: isWorkerOnline(worker.data?.last_seen_at), ...(data.deferred ? { deferred: true } : {}) }, 202);
  } catch (error) { return householdFailure(error); }
}

const lookupSchema = z.object({ id: z.uuid(), householdId: z.uuid() });
export async function getAiJob(request: Request) {
  try {
    const { db, user } = await authorizeHouseholdRequest(request);
    const input = z.object({ householdId: z.uuid(), id: z.uuid().optional(), sessionId: z.string().min(1).max(120).optional(), kind: aiJobSchema.shape.kind.optional() }).refine((value) => Boolean(value.id) !== Boolean(value.sessionId)).parse(Object.fromEntries(new URL(request.url).searchParams));
    await requireHouseholdMember(db, user.id, input.householdId);
    const query = db.from("household_ai_jobs").select("*").eq("household_id", input.householdId);
    if (input.kind) query.eq("kind", input.kind);
    const result = await (input.id ? query.eq("id", input.id) : query.eq("session_id", input.sessionId!).order("created_at", { ascending: false }).limit(1)).maybeSingle();
    checkDatabaseError(result.error);
    if (!result.data && input.id) throw new HouseholdApiError(404, "job_not_found", "This assistant request was not found.");
    const worker = await db.from("household_ai_workers").select("last_seen_at").eq("household_id", input.householdId).maybeSingle();
    checkDatabaseError(worker.error);
    return householdResponse({ job: result.data ? await publicJobWithActor(db, result.data) : null, workerOnline: isWorkerOnline(worker.data?.last_seen_at) });
  } catch (error) { return householdFailure(error); }
}

export async function cancelAiJob(request: Request) {
  try {
    const { db, user } = await authorizeHouseholdRequest(request);
    const input = lookupSchema.parse(await householdRequestBody(request));
    await requireHouseholdMember(db, user.id, input.householdId);
    const result = await db.from("household_ai_jobs").update({ status: "cancelled", error: "Cancelled by a household member.", updated_at: new Date().toISOString() }).eq("id", input.id).eq("household_id", input.householdId).in("status", ["queued", "running"]).select("*").maybeSingle();
    checkDatabaseError(result.error);
    if (result.data) return householdResponse({ job: publicAiJob(result.data) });
    const existing = await db.from("household_ai_jobs").select("*").eq("id", input.id).eq("household_id", input.householdId).maybeSingle();
    checkDatabaseError(existing.error);
    if (!existing.data) throw new HouseholdApiError(404, "job_not_found", "This assistant request was not found.");
    return householdResponse({ job: publicAiJob(existing.data) });
  } catch (error) { return householdFailure(error); }
}

export async function aiWorkerRequest(request: Request) {
  try {
    const householdId = authorizeWorker(request);
    const input = workerActionSchema.parse(await householdRequestBody(request));
    const db = getHouseholdDatabase();
    if (input.action === "claim") {
      const { data, error } = await db.rpc("lunchbox_claim_job", { p_household: householdId });
      checkDatabaseError(error);
      return householdResponse({ job: data ? await claimDetails(db, data) : null });
    }
    if (input.action === "heartbeat") {
      const { data, error } = await db.rpc("lunchbox_heartbeat_job", { p_household: householdId, p_id: input.jobId, p_lease: input.leaseToken });
      checkDatabaseError(error);
      return householdResponse({ active: data === true });
    }
    const fetched = await db.from("household_ai_jobs").select("*").eq("id", input.jobId).eq("household_id", householdId).maybeSingle();
    checkDatabaseError(fetched.error);
    if (!fetched.data || fetched.data.lease_token !== input.leaseToken) throw new HouseholdApiError(409, "lease_lost", "This worker no longer owns the request.");
    const job = await claimDetails(db, fetched.data);
    if (input.action === "complete") {
      try { validateAiJobResult(job, input.result); }
      catch { throw new HouseholdApiError(400, "invalid_result", "The worker proposed an invalid household change. Revise and retry."); }
    }
    const { data, error } = await db.rpc("lunchbox_finish_job", { p_household: householdId, p_id: input.jobId, p_lease: input.leaseToken, p_result: input.action === "complete" ? input.result : null, p_error: input.action === "fail" ? "Local AI could not complete this request. Retry or continue planning manually." : null });
    checkDatabaseError(error);
    if (data.rejected) throw new HouseholdApiError(409, "lease_lost", "This request was cancelled, completed, or its worker lease expired.");
    return householdResponse({ job: publicAiJob(data) });
  } catch (error) { return householdFailure(error); }
}
