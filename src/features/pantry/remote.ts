import { z } from "zod";
import { getAccountClient } from "@/features/accounts/client";
import type { HouseholdState } from "@/lib/contracts";
import { remoteHouseholdSchema, type RemoteHousehold, type RemoteCommand } from "./remote-protocol";

export class RemoteHouseholdError extends Error {
  constructor(public code: string, message: string, public latest?: RemoteHousehold, public status = 0) { super(message); }
}

/** Authenticated transport shared by the existing household provider and settings. */
export async function householdFetch(path: string, body?: unknown, options: { method?: string; signal?: AbortSignal } = {}) {
  const client = getAccountClient();
  const session = client ? (await client.auth.getSession()).data.session : null;
  if (!session) throw new RemoteHouseholdError("sign_in_required", "Sign in to use your shared household.", undefined, 401);
  let response: Response;
  try {
    response = await fetch(`/api/household${path}`, {
      method: options.method ?? (body === undefined ? "GET" : "POST"),
      headers: { Authorization: `Bearer ${session.access_token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: options.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new RemoteHouseholdError("offline", "Shared household storage is offline. Your edit has not been saved.");
  }
  const data = await response.json();
  if (!response.ok) {
    const latest = remoteHouseholdSchema.safeParse(data.latest);
    throw new RemoteHouseholdError(typeof data.code === "string" ? data.code : "storage_unavailable", typeof data.error === "string" ? data.error : "Your edit has not been saved. Try again.", latest.success ? latest.data : undefined, response.status);
  }
  return data as unknown;
}

export async function loadRemoteHousehold(signal?: AbortSignal): Promise<RemoteHousehold | null> {
  const data = await householdFetch("", undefined, { signal });
  if (z.object({ household: z.null() }).safeParse(data).success) return null;
  return remoteHouseholdSchema.parse(data);
}

export async function createRemoteHousehold(name: string, state: HouseholdState) {
  return remoteHouseholdSchema.parse(await householdFetch("", { name, state }));
}

export async function sendRemoteCommand(command: RemoteCommand) {
  return remoteHouseholdSchema.extend({ duplicate: z.boolean(), receipt: z.unknown() }).parse(await householdFetch("/commands", command));
}

export async function inviteToHousehold(householdId: string, email: string) {
  return z.object({ token: z.string(), expiresAt: z.iso.datetime() }).parse(await householdFetch("/invitations", { householdId, email }));
}

export async function joinRemoteHousehold(token: string) {
  return remoteHouseholdSchema.parse(await householdFetch("/join", { token }));
}
