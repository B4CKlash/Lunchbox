import { householdStateSchema, type HouseholdState, type PlanningProposal } from "@/lib/contracts";

export const HOUSEHOLD_STORAGE_KEY = "lunchbox.household.v1";
// Recovery archive only. The active household still has one storage key/adapter.
export const HOUSEHOLD_RECOVERY_KEY = "lunchbox.household.recovery.v1";
export type ProposalReviewSelection = { excludedAllocationIds: string[]; includeOtherChanges: boolean };
export type CachedProposalReview = ProposalReviewSelection & { proposalId: string; fingerprint: string };
export type PlanningComposer = { draft: string; mode: "fixture" | "local"; proposalReviews?: CachedProposalReview[] };
export type CachedPlanningComposer = PlanningComposer & { sessionId: string };
export type HouseholdCache = { ownerId: string | null; householdId: string | null; pending?: unknown; planningComposer?: CachedPlanningComposer };

/** Revisions may advance for conversation edits; the reviewed effects must stay identical. */
export function proposalReviewFingerprint(proposal: PlanningProposal) {
  // Database JSON and schema parsing can reorder keys without changing meaning.
  return JSON.stringify({ title: proposal.title, changes: proposal.changes, legacyMeals: proposal.legacyMeals }, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value);
}

export function readProposalReview(value: unknown, proposal: PlanningProposal): CachedProposalReview | undefined {
  if (proposal.status !== "pending" || !value || typeof value !== "object"
    || !("proposalId" in value) || value.proposalId !== proposal.id
    || !("fingerprint" in value) || value.fingerprint !== proposalReviewFingerprint(proposal)
    || !("includeOtherChanges" in value) || typeof value.includeOtherChanges !== "boolean"
    || !("excludedAllocationIds" in value) || !Array.isArray(value.excludedAllocationIds)) return undefined;
  const available = new Set(proposal.changes.flatMap((change) => change.type === "create_batch" ? change.allocations.map((allocation) => allocation.id) : change.type === "allocate" ? [change.allocation.id] : []));
  if (value.excludedAllocationIds.length > available.size || !value.excludedAllocationIds.every((id) => typeof id === "string" && available.has(id)) || new Set(value.excludedAllocationIds).size !== value.excludedAllocationIds.length) return undefined;
  return { proposalId: proposal.id, fingerprint: value.fingerprint, excludedAllocationIds: [...value.excludedAllocationIds], includeOtherChanges: value.includeOtherChanges };
}

export function readPlanningComposer(value: unknown, sessionId: string, proposals: readonly PlanningProposal[] = []): CachedPlanningComposer | undefined {
  if (!value || typeof value !== "object" || !("sessionId" in value) || value.sessionId !== sessionId || !("draft" in value) || typeof value.draft !== "string" || value.draft.length > 2000 || !("mode" in value) || (value.mode !== "fixture" && value.mode !== "local")) return undefined;
  const reviews = "proposalReviews" in value && Array.isArray(value.proposalReviews) ? value.proposalReviews.slice(0, 100) : [];
  const proposalReviews = proposals.flatMap((proposal) => {
    const review = readProposalReview(reviews.find((entry) => entry?.proposalId === proposal.id), proposal);
    return review ? [review] : [];
  });
  return { sessionId, draft: value.draft, mode: value.mode, ...(proposalReviews.length ? { proposalReviews } : {}) };
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
  const state = householdStateSchema.safeParse(parsed.state);
  const planningComposer = readPlanningComposer(parsed.planningComposer, parsed.state?.pilot?.session?.id, state.success ? state.data.pilot?.proposals : []);
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
