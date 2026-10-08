"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  type CalendarSettings, type ChatMessage, type HouseholdState, type PantryItem,
  type PlannedMeal, type Preferences, type Recipe, type RecipeSource,
  type SuggestMealsRequest, type WorkspaceMode, type PilotOperation, type Unit,
} from "@/lib/contracts";
import { applyHouseholdAction, type HouseholdAction } from "@/features/meals/workspace-state";
import { createSampleHousehold } from "@/features/pantry/seed";
import { loadHousehold, saveHousehold, preserveHouseholdRecovery, readHouseholdCache, recoverHouseholdForOwner, readPlanningComposer, readProposalReview, type PlanningComposer, type CachedPlanningComposer, type CachedProposalReview } from "@/features/pantry/storage";
import { ensurePilot, applyPilotCommand } from "@/features/planning/pilot";
import { getAccountClient } from "@/features/accounts/client";
import { loadRemoteHousehold, createRemoteHousehold, sendRemoteCommand, joinRemoteHousehold, RemoteHouseholdError } from "@/features/pantry/remote";
import { remoteCommandSchema, type HouseholdMutation, type RemoteCommand, type RemoteHousehold } from "@/features/pantry/remote-protocol";
import { canReadHouseholdCache, checkQueuedMutationRevision, rebaseRemoteCommand } from "@/features/pantry/remote-conflicts";

type EditResult = { ok: boolean; error?: string };
type HouseholdContextValue = {
  state: HouseholdState; ready: boolean; storageError: string | null; updateError: string | null;
  chatResetVersion: number; householdResetVersion: number;
  householdId: string | null; currentMemberId: string | null; syncStatus: string; pendingChange: boolean;
  planningComposer: PlanningComposer; setPlanningComposer: (patch: Partial<Pick<PlanningComposer, "draft" | "mode">>) => void;
  setProposalReview: (review: CachedProposalReview) => void;
  dispatchPilot: (operation: PilotOperation) => Promise<EditResult>;
  createSharedHousehold: (name: string) => Promise<EditResult>;
  joinHousehold: (token: string) => Promise<EditResult>;
  refreshHousehold: () => Promise<void>; retryPending: () => Promise<void>; discardPending: () => void;
  setPantry: (pantry: PantryItem[], confirmedExactStock?: { ingredientId: string; unit: Unit }[]) => Promise<EditResult>;
  setPreferences: (preferences: Preferences) => Promise<EditResult>;
  recordSuggestions: (input: SuggestMealsRequest, recipes: Recipe[]) => void;
  deferAiRequests: (until: number) => void;
  addMeal: (recipe: Recipe, servings: number) => Promise<EditResult>;
  removeMeal: (id: string) => void;
  setMealServings: (id: string, servings: number) => void;
  setCalendarSettings: (patch: Partial<CalendarSettings>) => void;
  setCalendarDraft: (meals: PlannedMeal[]) => void;
  commitCalendar: () => void; discardCalendarDraft: () => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  saveRecipe: (recipe: Recipe, source: RecipeSource) => Promise<EditResult>;
  removeSavedRecipe: (recipeId: string) => Promise<EditResult>;
  setChatDraft: (text: string) => void;
  discussRecipe: (recipe: Recipe, servings: number) => Promise<EditResult>;
  clearRecipeFocus: () => void;
  appendChatMessages: (messages: ChatMessage[]) => void;
  completeChatTurn: (messages: ChatMessage[], submittedDraft: string) => void;
  clearChat: () => void; reset: () => void;
};
const HouseholdContext = createContext<HouseholdContextValue | null>(null);
const messageFor = (error: unknown) => error instanceof Error ? error.message : "The change could not be saved. Please retry.";

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(createSampleHousehold);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [chatResetVersion, setChatResetVersion] = useState(0);
  const [householdResetVersion, setHouseholdResetVersion] = useState(0);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState("Saved in this browser");
  const [pendingChange, setPendingChange] = useState(false);
  const [planningComposer, setComposerState] = useState<PlanningComposer>({ draft: "", mode: "fixture" });
  const composer = useRef<CachedPlanningComposer | undefined>(undefined);
  const stateRef = useRef(state);
  const owner = useRef<string | null>(null);
  const remote = useRef<RemoteHousehold | null>(null);
  const pending = useRef<RemoteCommand | null>(null);
  const epoch = useRef(0);
  const busy = useRef(false);
  const hydrated = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Keep an in-memory recovery copy as well: an auth change can happen while a
  // network request is unresolved or browser storage is full. A different
  // account cannot see these copies, and returning retries the original ID.
  const sessionCopies = useRef(new Map<string, { state: HouseholdState; remote: RemoteHousehold | null; pending: RemoteCommand | null; planningComposer?: CachedPlanningComposer }>());

  const publishComposer = useCallback((next: CachedPlanningComposer | undefined) => {
    composer.current = next;
    setComposerState(next ? { draft: next.draft, mode: next.mode, ...(next.proposalReviews ? { proposalReviews: next.proposalReviews } : {}) } : { draft: "", mode: "fixture" });
  }, []);

  const persist = useCallback(() => {
    try {
      saveHousehold(window.localStorage, stateRef.current, { ownerId: owner.current, householdId: remote.current?.householdId ?? null, pending: pending.current ?? undefined, planningComposer: composer.current });
      setStorageError(null);
    } catch {
      setStorageError("This browser could not save your changes. Keep this tab open and export your kitchen before leaving.");
    }
  }, []);
  const publish = useCallback((next: HouseholdState) => {
    if (next.pilot) publishComposer(readPlanningComposer(composer.current, next.pilot.session.id, next.pilot.proposals) ?? { sessionId: next.pilot.session.id, draft: next.pilot.session.draft, mode: "fixture" });
    stateRef.current = next;
    setState(next);
    persist();
  }, [persist, publishComposer]);
  const acceptRemote = useCallback((next: RemoteHousehold) => {
    if (remote.current?.householdId !== next.householdId && next.state.pilot) publishComposer({ sessionId: next.state.pilot.session.id, draft: next.state.pilot.session.draft, mode: "fixture" });
    remote.current = next;
    setHouseholdId(next.householdId);
    setCurrentMemberId(next.currentMemberId ?? null);
    publish(next.state);
    setSyncStatus("Household synced");
  }, [publish, publishComposer]);

  const refreshHousehold = useCallback(async () => {
    if (!owner.current || busy.current) return;
    const requestEpoch = epoch.current;
    try {
      const latest = await loadRemoteHousehold();
      if (requestEpoch !== epoch.current || busy.current) return;
      if (!latest && remote.current) {
        try { preserveHouseholdRecovery(window.localStorage, "Shared household membership is no longer available"); }
        catch {
          // A confirmed loss of access hides the cached kitchen even when the
          // recovery archive is full. Keep its disk bytes untouched.
          sessionCopies.current.delete(owner.current ?? "browser");
          remote.current = null; pending.current = null;
          const blank = ensurePilot(createSampleHousehold()); stateRef.current = blank; setState(blank);
          publishComposer(undefined);
          setHouseholdId(null); setCurrentMemberId(null); setPendingChange(false); setReady(false);
          setStorageError("Shared household access ended, and the recovery copy could not be saved. The original browser data was preserved. Free browser storage before reloading.");
          return;
        }
        ++epoch.current;
        remote.current = null; pending.current = null;
        sessionCopies.current.delete(owner.current ?? "browser");
        publishComposer(undefined);
        setHouseholdId(null); setCurrentMemberId(null); setPendingChange(false);
        publish(ensurePilot(createSampleHousehold()));
        setHouseholdResetVersion((value) => value + 1);
        setUpdateError("Your account no longer has access to the saved shared household. A recovery copy was preserved in this browser.");
        setSyncStatus("Browser kitchen · join a household in Your account");
      } else if (pending.current && latest?.householdId === remote.current?.householdId) {
        // Verify membership while retaining a pending command for explicit retry.
        return;
      } else if (latest && (!remote.current || latest.householdId !== remote.current.householdId || latest.revision > remote.current.revision || latest.currentMemberId !== remote.current.currentMemberId)) {
        if (!remote.current) preserveHouseholdRecovery(window.localStorage, "Before opening shared household");
        if (remote.current && latest.householdId !== remote.current.householdId) {
          preserveHouseholdRecovery(window.localStorage, "Before changing shared households");
          ++epoch.current;
          pending.current = null; setPendingChange(false);
          setHouseholdResetVersion((value) => value + 1);
        }
        acceptRemote(latest);
      } else setSyncStatus(latest ? "Household synced" : "Browser kitchen · create or join a household in Your account");
    } catch (error) {
      if (requestEpoch === epoch.current) setSyncStatus(remote.current ? "Connection unavailable · saved household copy" : messageFor(error));
    }
  }, [acceptRemote, publish, publishComposer]);

  useEffect(() => {
    const client = getAccountClient();
    let active = true;
    let authEvents = 0;
    async function switchAccount(userId: string | null) {
      if (!active) return;
      if (hydrated.current && userId === owner.current) { setReady(true); void refreshHousehold(); return; }
      if (hydrated.current) {
        sessionCopies.current.set(owner.current ?? "browser", structuredClone({ state: stateRef.current, remote: remote.current, pending: pending.current, planningComposer: composer.current }));
      }
      const requestEpoch = ++epoch.current;
      busy.current = false;
      setReady(false);
      try {
        let cache = readHouseholdCache(window.localStorage);
        let saved = loadHousehold(window.localStorage);
        // A cached authenticated household is never shown to a different account.
        if (cache.ownerId !== userId) {
          preserveHouseholdRecovery(window.localStorage, "Before changing signed-in account");
          const recovered = recoverHouseholdForOwner(window.localStorage, userId);
          if (recovered) { cache = recovered.cache; saved = recovered.state; }
        }
        const remembered = sessionCopies.current.get(userId ?? "browser");
        if (remembered) {
          cache = { ownerId: userId, householdId: remembered.remote?.householdId ?? null, pending: remembered.pending ?? undefined, planningComposer: remembered.planningComposer };
          saved = remembered.state;
        }
        const compatible = canReadHouseholdCache(cache, userId);
        const base = compatible && saved ? saved : createSampleHousehold();
        if (saved && !saved.pilot && compatible) preserveHouseholdRecovery(window.localStorage, "Before live-calendar migration");
        if (!saved) preserveHouseholdRecovery(window.localStorage, "Unreadable original save");
        owner.current = userId;
        setAccountId(userId);
        remote.current = compatible && saved && cache.householdId ? { householdId: cache.householdId, revision: saved.pilot?.revision ?? 0, state: saved } : null;
        const pendingResult = compatible && cache.pending ? remoteCommandSchema.safeParse(cache.pending) : null;
        if (compatible && cache.pending && (!pendingResult?.success || !remote.current || pendingResult.data.householdId !== remote.current.householdId)) {
          throw new Error("The saved pending change does not belong to this household.");
        }
        pending.current = pendingResult?.success ? pendingResult.data : null;
        setPendingChange(Boolean(pending.current));
        setHouseholdId(remote.current?.householdId ?? null);
        setCurrentMemberId(remote.current?.currentMemberId ?? null);
        publishComposer(compatible && base.pilot ? readPlanningComposer(cache.planningComposer, base.pilot.session.id, base.pilot.proposals) : undefined);
        publish(ensurePilot(base));
        if (remote.current) remote.current.state = stateRef.current;
        hydrated.current = true;
        setReady(true);
        setUpdateError(null);
        setSyncStatus(pending.current ? "Unsaved change · retry or discard" : "Saved in this browser");
        setHouseholdResetVersion((value) => value + 1);
        if (userId && requestEpoch === epoch.current) await refreshHousehold();
      } catch {
        if (active && requestEpoch === epoch.current) {
          // Never retain another account's data in visible context if archival
          // failed. The original storage bytes are left untouched for recovery.
          owner.current = userId; setAccountId(userId); remote.current = null; pending.current = null; hydrated.current = false;
          const blank = ensurePilot(createSampleHousehold());
          stateRef.current = blank; setState(blank);
          publishComposer(undefined);
          setHouseholdId(null); setCurrentMemberId(null); setPendingChange(false);
          setStorageError("Your saved kitchen could not be recovered safely. Existing data has been preserved. Export browser storage before trying again."); setReady(false);
        }
      }
    }
    if (client) {
      const authDeadline = window.setTimeout(() => {
        if (active && !hydrated.current) setStorageError("Your sign-in is taking longer than expected. Reload this page to retry; your saved household has been kept.");
      }, 15_000);
      const initialAuthEvent = authEvents;
      void client.auth.getSession().then(({ data }) => {
        if (active && initialAuthEvent === authEvents) return switchAccount(data.session?.user.id ?? null);
      }).catch(() => { if (active) { setStorageError("Your sign-in could not be checked. Reload to retry safely."); setReady(false); } });
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        ++authEvents;
        // Do not await Supabase calls inside its auth callback lock.
        window.setTimeout(() => { if (active) void switchAccount(session?.user.id ?? null); }, 0);
      });
      return () => { active = false; window.clearTimeout(authDeadline); subscription.unsubscribe(); };
    }
    void switchAccount(null);
    return () => { active = false; };
  }, [publish, publishComposer, refreshHousehold]);

  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void refreshHousehold(); }, 5000);
    const refresh = () => { void refreshHousehold(); };
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(id); window.removeEventListener("focus", refresh); };
  }, [ready, refreshHousehold]);

  async function sendPending(command: RemoteCommand): Promise<EditResult> {
    const requestEpoch = epoch.current;
    busy.current = true;
    pending.current = command; setPendingChange(true); persist();
    setSyncStatus("Saving household change…");
    try {
      const result = await sendRemoteCommand(command);
      if (requestEpoch !== epoch.current) return { ok: false, error: "Account changed while saving." };
      pending.current = null; setPendingChange(false);
      acceptRemote(result); setUpdateError(null);
      return { ok: true };
    } catch (error) {
      if (requestEpoch !== epoch.current) return { ok: false, error: "Account changed while saving." };
      if (error instanceof RemoteHouseholdError && error.latest) {
        try { preserveHouseholdRecovery(window.localStorage, "Unsaved edit conflicted with a newer household revision"); }
        catch {
          const message = "The conflict recovery copy could not be saved. Your pending change was kept. Free browser storage before retrying.";
          setStorageError(message); setUpdateError(message); setSyncStatus("Unsaved change · recovery needed");
          return { ok: false, error: message };
        }
        const rebased = rebaseRemoteCommand(command, error.latest.revision);
        pending.current = rebased; setPendingChange(Boolean(rebased));
        acceptRemote(error.latest);
        if (!rebased) {
          const message = "Another household member changed this information. The current household is shown. Review it and make your edit again; the previous unsaved edit is preserved in browser recovery.";
          setUpdateError(message); setSyncStatus("Conflict · review the current household"); persist();
          return { ok: false, error: message };
        }
      }
      const errorMessage = messageFor(error);
      setUpdateError(errorMessage); setSyncStatus("Unsaved change · retry or discard"); persist();
      return { ok: false, error: errorMessage };
    } finally { if (requestEpoch === epoch.current) busy.current = false; }
  }

  function edit(operation: PilotOperation | HouseholdAction, isPilot: boolean): Promise<EditResult> {
    if (accountId !== owner.current || householdId !== (remote.current?.householdId ?? null)) return Promise.resolve({ ok: false, error: "The signed-in account or household changed. Make this edit again in the current kitchen." });
    const actionEpoch = epoch.current;
    // The caller received this context method with this rendered snapshot. A
    // delayed UI closure must not bless its old full-session/pantry payload by
    // reading a newer mutable ref when it finally dispatches.
    const originRevision = state.pilot?.revision ?? 0;
    const work = queue.current.then(async (): Promise<EditResult> => {
      if (actionEpoch !== epoch.current) return { ok: false, error: "Account changed. Try your edit again." };
      if (pending.current) { const error = "Resolve the unsaved change before making another edit."; setUpdateError(error); return { ok: false, error }; }
      if (busy.current) { const error = "Your household is being opened or shared. Wait for it to finish, then make this edit again."; setUpdateError(error); return { ok: false, error }; }
      try {
        const commandId = crypto.randomUUID();
        const current = stateRef.current;
        const pilotCommand = { id: commandId, expectedRevision: current.pilot?.revision ?? 0, operation: operation as PilotOperation };
        const mutation: HouseholdMutation = isPilot ? { kind: "pilot", command: pilotCommand } : { kind: "legacy", action: operation as Exclude<HouseholdAction, { type: "replace" }> };
        checkQueuedMutationRevision(mutation, originRevision, current.pilot?.revision ?? 0);
        const next = isPilot ? applyPilotCommand(current, pilotCommand).state : applyHouseholdAction(current, operation as HouseholdAction);
        if (remote.current) {
          if (!isPilot && operation.type === "replace") throw new Error("A shared household cannot be reset to sample data.");
          return await sendPending({ householdId: remote.current.householdId, expectedRevision: remote.current.revision, commandId,
            command: mutation });
        }
        publish(next); setUpdateError(null); return { ok: true };
      } catch (error) { const message = messageFor(error); setUpdateError(message); return { ok: false, error: message }; }
    });
    queue.current = work;
    return work;
  }
  const legacy = (action: HouseholdAction) => edit(action, false);
  const addCandidate = (recipe: Recipe, servings: number) => legacy({ type: "discussRecipe", recipe, servings });
  async function transition(action: () => Promise<RemoteHousehold>): Promise<EditResult> {
    if (accountId !== owner.current || householdId !== (remote.current?.householdId ?? null)) return { ok: false, error: "The signed-in account or household changed. Try again." };
    const startingEpoch = epoch.current;
    await queue.current;
    if (startingEpoch !== epoch.current) return { ok: false, error: "Account changed. Try again." };
    if (pending.current || busy.current) return { ok: false, error: "Resolve the unsaved change first." };
    let requestEpoch = epoch.current;
    try {
      preserveHouseholdRecovery(window.localStorage, "Before household import or join");
      busy.current = true;
      requestEpoch = ++epoch.current;
      const result = await action();
      if (epoch.current !== requestEpoch) return { ok: false, error: "Account changed. Please retry." };
      acceptRemote(result); setHouseholdResetVersion((value) => value + 1); return { ok: true };
    } catch (error) { const message = messageFor(error); if (epoch.current === requestEpoch) setUpdateError(message); return { ok: false, error: message }; }
    finally { if (epoch.current === requestEpoch) busy.current = false; }
  }
  return <HouseholdContext.Provider value={{
    state, ready, storageError, updateError, chatResetVersion, householdResetVersion,
    householdId, currentMemberId, syncStatus, pendingChange,
    planningComposer,
    setPlanningComposer: (patch) => {
      if (accountId !== owner.current || householdId !== (remote.current?.householdId ?? null) || state.pilot?.session.id !== stateRef.current.pilot?.session.id) return;
      const sessionId = stateRef.current.pilot?.session.id;
      if (!sessionId) return;
      const previous = composer.current?.sessionId === sessionId ? composer.current : { sessionId, draft: "", mode: "fixture" as const };
      const next = readPlanningComposer({ ...previous, ...patch }, sessionId, stateRef.current.pilot?.proposals);
      if (!next) return;
      publishComposer(next); persist();
    },
    setProposalReview: (review) => {
      if (accountId !== owner.current || householdId !== (remote.current?.householdId ?? null) || state.pilot?.session.id !== stateRef.current.pilot?.session.id) return;
      const pilot = stateRef.current.pilot;
      const proposal = pilot?.proposals.find((entry) => entry.id === review.proposalId);
      if (!pilot || !proposal) return;
      // Match the content shown by the caller before recording a device-only
      // choice. A changed proposal must be reviewed afresh, even with the same ID.
      const valid = readProposalReview(review, proposal);
      if (!valid) return;
      const previous = readPlanningComposer(composer.current, pilot.session.id, pilot.proposals) ?? { sessionId: pilot.session.id, draft: pilot.session.draft, mode: "fixture" as const };
      publishComposer({ ...previous, proposalReviews: [...(previous.proposalReviews ?? []).filter((entry) => entry.proposalId !== proposal.id), valid] });
      persist();
    },
    dispatchPilot: (operation) => edit(operation, true),
    createSharedHousehold: (name) => transition(() => createRemoteHousehold(name, stateRef.current)),
    joinHousehold: (token) => transition(() => joinRemoteHousehold(token)),
    refreshHousehold,
    retryPending: async () => { if (pending.current && !busy.current) await sendPending(pending.current); },
    discardPending: () => { if (!busy.current) { pending.current = null; setPendingChange(false); setUpdateError(null); persist(); void refreshHousehold(); } },
    setPantry: (pantry, confirmedExactStock) => legacy({ type: "setPantry", pantry, confirmedExactStock }),
    setPreferences: (preferences) => legacy({ type: "setPreferences", preferences }),
    recordSuggestions: (input, recipes) => legacy({ type: "recordSuggestions", input, recipes }),
    deferAiRequests: (until) => legacy({ type: "deferAiRequests", until }),
    addMeal: addCandidate,
    removeMeal: (id) => legacy({ type: "removeMeal", id }),
    setMealServings: (id, servings) => legacy({ type: "setMealServings", id, servings }),
    setCalendarSettings: (patch) => legacy({ type: "setCalendarSettings", patch }),
    setCalendarDraft: (meals) => legacy({ type: "setCalendarDraft", meals }),
    commitCalendar: () => legacy({ type: "commitCalendar" }),
    discardCalendarDraft: () => legacy({ type: "discardCalendarDraft" }),
    setWorkspaceMode: (mode) => legacy({ type: "setWorkspaceMode", mode }),
    saveRecipe: (recipe, source) => legacy({ type: "saveRecipe", recipe: { ...recipe, provenance: recipe.provenance ?? { source } }, source }),
    removeSavedRecipe: (recipeId) => legacy({ type: "removeSavedRecipe", recipeId }),
    setChatDraft: (text) => legacy({ type: "setChatDraft", text }),
    discussRecipe: addCandidate,
    clearRecipeFocus: () => legacy({ type: "clearRecipeFocus" }),
    appendChatMessages: (messages) => legacy({ type: "appendChatMessages", messages }),
    completeChatTurn: (messages, submittedDraft) => legacy({ type: "completeChatTurn", messages, submittedDraft }),
    clearChat: () => { setChatResetVersion((value) => value + 1); legacy({ type: "clearChat" }); },
    reset: () => {
      if (busy.current || pending.current) { setUpdateError("Finish or resolve the current household change before resetting."); return; }
      if (remote.current) { setUpdateError("A shared household cannot be reset to sample data."); return; }
      try { preserveHouseholdRecovery(window.localStorage, "Before sample reset"); }
      catch { setUpdateError("The recovery copy could not be saved. Your kitchen was kept."); return; }
      ++epoch.current; setChatResetVersion((value) => value + 1); setHouseholdResetVersion((value) => value + 1);
      publishComposer(undefined);
      publish(ensurePilot(createSampleHousehold()));
    },
  }}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (!context) throw new Error("useHousehold must be used inside HouseholdProvider");
  return context;
}
