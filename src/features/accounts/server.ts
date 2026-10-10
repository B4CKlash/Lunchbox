import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { readJsonBody, RequestBodyError, withRequestDeadline } from "@/features/meals/request-boundary";

export class HouseholdApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** The admin client must never be imported by client components. */
export function getHouseholdDatabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.LUNCHBOX_HOUSEHOLD_ENABLED !== "true" || !url || !key)
    throw new HouseholdApiError(503, "household_unconfigured", "Shared household storage is not configured. Your browser household is still available.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function authorizeHouseholdRequest(request: Request, db = getHouseholdDatabase()): Promise<{ db: SupabaseClient; user: User }> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 8192) throw new HouseholdApiError(401, "sign_in_required", "Sign in to use your shared household.");
  // getUser verifies the token with Supabase. Decoded JWT claims are not sufficient.
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HouseholdApiError(401, "sign_in_required", "Your sign-in expired. Sign in again.");
  return { db, user: data.user };
}

export async function requireHouseholdMember(db: SupabaseClient, userId: string, householdId: string, ownerOnly = false) {
  const { data, error } = await db.from("household_members").select("role").eq("household_id", householdId).eq("user_id", userId).maybeSingle();
  if (error) throw new HouseholdApiError(503, "storage_unavailable", "Shared household storage is unavailable. Try again.");
  if (!data || (ownerOnly && data.role !== "owner")) throw new HouseholdApiError(403, "not_authorized", "You do not have access to this household action.");
}

export function checkDatabaseError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "23505") throw new HouseholdApiError(409, "already_joined", "This account already belongs to a household. Refresh to load it.");
  if (error.code === "42501") throw new HouseholdApiError(403, "not_authorized", "This household action is not authorized or the invitation has expired.");
  if (error.code === "22023") throw new HouseholdApiError(409, "command_id_reused", "This request identifier was already used for a different action.");
  if (error.code === "22004") throw new HouseholdApiError(409, "member_mapping", "Keep a household person for each signed-in member. Add an unassigned person before inviting another account.");
  throw new HouseholdApiError(503, "storage_unavailable", "Shared household storage is unavailable. Your changes have not been saved.");
}

export async function householdRequestBody(request: Request) {
  return withRequestDeadline(request.signal, (signal) => readJsonBody(request, { signal, maxBytes: 3_000_000 }), 15_000);
}

export function householdResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function householdFailure(error: unknown) {
  if (error instanceof HouseholdApiError) return householdResponse({ code: error.code, error: error.message, ...(error.details ? { latest: error.details } : {}) }, error.status);
  if (error instanceof ZodError) return householdResponse({ code: "invalid_request", error: "Check the household details and try again." }, 400);
  if (error instanceof RequestBodyError) return householdResponse({ code: error.code, error: error.message }, error.status);
  return householdResponse({ code: "storage_unavailable", error: "The household action could not be saved. Try again." }, 503);
}
