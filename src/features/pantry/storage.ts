import { householdStateSchema, type HouseholdState } from "@/lib/contracts";

export const HOUSEHOLD_STORAGE_KEY = "lunchbox.household.v1";
// Recovery archive only. The active household still has one storage key/adapter.
export const HOUSEHOLD_RECOVERY_KEY = "lunchbox.household.recovery.v1";
export type PlanningComposer = { draft: string; mode: "fixture" | "local" };
export type CachedPlanningComposer = PlanningComposer & { sessionId: string };
export type HouseholdCache = { ownerId: string | null; householdId: string | null; pending?: unknown; planningComposer?: CachedPlanningComposer };

export function readPlanningComposer(value: unknown, sessionId: string): CachedPlanningComposer | undefined {
  if (!value || typeof value !== "object" || !("sessionId" in value) || value.sessionId !== sessionId || !("draft" in value) || typeof value.draft !== "string" || value.draft.length > 2000 || !("mode" in value) || (value.mode !== "fixture" && value.mode !== "local")) return undefined;
  return { sessionId, draft: value.draft, mode: value.mode };
}

/** Save the original bytes before migration, importing, or changing accounts.
 * Failure must stop the transition, so a full browser never destroys its only copy.
 */
export function preserveHouseholdRecovery(
  storage: Pick<Storage, "getItem" | "setItem">,
  reason: string,
  now = new Date().toISOString(),
): void {
  const raw = storage.getItem(HOUSEHOLD_STORAGE_KEY);
  if (raw === null) return;
  const archiveRaw = storage.getItem(HOUSEHOLD_RECOVERY_KEY);
  let archive: { savedAt: string; reason: string; raw: string }[] = [];
  if (archiveRaw !== null) {
    const parsed: unknown = JSON.parse(archiveRaw);
    if (!Array.isArray(parsed) || !parsed.every((entry) => entry && typeof entry.raw === "string" && typeof entry.savedAt === "string" && typeof entry.reason === "string")) {
      throw new Error("The recovery archive could not be read. Export browser data before continuing.");
    }
    archive = parsed;
  }
  if (archive.some((entry) => entry.raw === raw)) return;
  // Never trim recovery copies automatically.
  storage.setItem(HOUSEHOLD_RECOVERY_KEY, JSON.stringify([...archive, { savedAt: now, reason, raw }]));
}

/** Missing, inaccessible, corrupt, and incompatible saves all use the caller's fallback. */
export function loadHousehold(
  storage: Pick<Storage, "getItem">,
): HouseholdState | null {
  try {
    const stored = storage.getItem(HOUSEHOLD_STORAGE_KEY);
    if (stored === null) return null;
    // The schema adds a blank workspace when reading pre-workspace v1 saves.
    // Keep the original key and all valid pantry, preferences, and meal data.
    const parsed = JSON.parse(stored);
    const result = householdStateSchema.safeParse(parsed?.cacheVersion === 1 ? parsed.state : parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Let write failures reach the UI so it can warn that changes are not saved. */
export function saveHousehold(
  storage: Pick<Storage, "setItem">,
  state: HouseholdState,
  cache?: HouseholdCache,
): void {
  storage.setItem(
    HOUSEHOLD_STORAGE_KEY,
    JSON.stringify(cache ? { cacheVersion: 1, ...cache, state: householdStateSchema.parse(state) } : householdStateSchema.parse(state)),
  );
}

export function readHouseholdCache(storage: Pick<Storage, "getItem">): HouseholdCache {
  const raw = storage.getItem(HOUSEHOLD_STORAGE_KEY);
  if (!raw) return { ownerId: null, householdId: null };
  const parsed = JSON.parse(raw);
  if (parsed?.cacheVersion !== 1) return { ownerId: null, householdId: null };
  const planningComposer = readPlanningComposer(parsed.planningComposer, parsed.state?.pilot?.session?.id);
  return { ownerId: parsed.ownerId ?? null, householdId: parsed.householdId ?? null, pending: parsed.pending, ...(planningComposer ? { planningComposer } : {}) };
}

/** Restore an account's last pending edit when returning after another sign-in.
 * This reads the existing recovery archive; it is not another active store.
 */
export function recoverHouseholdForOwner(storage: Pick<Storage, "getItem">, ownerId: string | null) {
  const raw = storage.getItem(HOUSEHOLD_RECOVERY_KEY);
  if (!raw) return null;
  const entries: unknown = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error("The recovery archive could not be read.");
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry: unknown = entries[index];
    if (!entry || typeof entry !== "object" || !("raw" in entry) || typeof entry.raw !== "string") continue;
    const recovered = { getItem: () => entry.raw as string };
    try {
      const cache = readHouseholdCache(recovered);
      if (cache.ownerId !== ownerId || (cache.householdId && !ownerId)) continue;
      const state = loadHousehold(recovered);
      if (state) return { state, cache };
    } catch { /* Older unreadable recovery records remain preserved. */ }
  }
  return null;
}
