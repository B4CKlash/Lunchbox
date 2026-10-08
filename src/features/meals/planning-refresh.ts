import { pilotChangeSchema, type HouseholdState, type PilotOperation, type PlanningSession, type Recipe } from "@/lib/contracts";

const refreshPrefix = "[LunchBox context refresh]\n";

export function isPlanningRefresh(message: string) {
  return message.startsWith(refreshPrefix);
}

export function planningRefreshSummary(message: string) {
  return isPlanningRefresh(message) ? message.slice(refreshPrefix.length).split("\n")[0] : message;
}

export function createPlanningRefreshMessage(reasons: string[]) {
  const summary = `Refresh ideas: ${[...new Set(reasons)].slice(-6).map((reason) => reason.slice(0, 180)).join("; ")}.`;
  return `${refreshPrefix}${summary}\nOffer recipe candidates or brief meal ideas for the current focus and kitchen context. This is an advisory refresh only. Do not propose any calendar, coverage, allocation, purchase, stock, cooking, consumption, feedback, or household changes. Keep existing meals unchanged. Do not claim any action has been completed.`;
}

/** Interaction refreshes never introduce household actions, even if a model ignores the prompt. */
export function planningResponseChanges(request: string, operations: PilotOperation[]) {
  if (isPlanningRefresh(request)) return [];
  return operations.flatMap((operation) => {
    if (operation.type === "propose") return operation.changes;
    const parsed = pilotChangeSchema.safeParse(operation);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Background ideas cannot replace or evict the recipe the user is discussing. */
export function planningResponseCandidates(session: PlanningSession, recipes: Recipe[], automatic: boolean) {
  const focused = automatic ? session.candidates.find((recipe) => recipe.id === session.focusedRecipeId) : undefined;
  const incoming = recipes.filter((recipe) => recipe.id !== focused?.id);
  const merged = [...session.candidates.filter((recipe) => recipe.id !== focused?.id && !incoming.some((candidate) => candidate.id === recipe.id)), ...incoming];
  return focused ? [...merged.slice(-29), focused] : merged.slice(-30);
}

/** Only kitchen facts and preferences invalidate advice; response/session bookkeeping does not. */
export function planningRefreshFingerprint(state: HouseholdState) {
  const pilot = state.pilot;
  const sort = <T,>(values: T[], key: (value: T) => string) => [...values].sort((left, right) => key(left).localeCompare(key(right)));
  return JSON.stringify({
    pantry: sort(state.pantry, (entry) => `${entry.id}:${entry.unit}`).map(({ id, name, unit, quantity, useSoon }) => ({ id, name, unit, quantity, useSoon })),
    stock: sort(pilot?.stock ?? [], (entry) => `${entry.ingredientId}:${entry.unit}`),
    stockChecks: sort(pilot?.stockChecks ?? [], (entry) => `${entry.ingredientId}:${entry.unit}`),
    prepared: sort(pilot?.prepared ?? [], (entry) => entry.batchId).map(({ batchId, produced, consumed, freezerPortions }) => ({ batchId, produced, consumed, freezerPortions })),
    preferences: state.preferences,
    members: pilot?.members,
    session: pilot ? { memberIds: pilot.session.memberIds, constraints: pilot.session.constraints, equipment: pilot.session.equipment, slots: pilot.session.slots, days: pilot.session.days, startDate: pilot.session.startDate } : null,
    feedback: pilot?.feedback,
  });
}

type RefreshOutcome = "sent" | "deferred";
type RefreshTimer = ReturnType<typeof setTimeout>;

/** An interaction timer, never a generation loop. Deferred work resumes only on an explicit signal. */
export function createPlanningRefreshQueue(
  run: (message: string, signal: AbortSignal) => Promise<RefreshOutcome>,
  options: { delayMs?: number; schedule?: (callback: () => void, delay: number) => RefreshTimer; cancel?: (timer: RefreshTimer) => void } = {},
) {
  const scheduleTimer = options.schedule ?? setTimeout;
  const cancelTimer = options.cancel ?? clearTimeout;
  const reasons = new Set<string>();
  let timer: RefreshTimer | undefined;
  let controller: AbortController | undefined;
  let running = false;
  let ready = false;
  let disposed = false;
  let idle = Promise.resolve();
  const clearTimer = () => { if (timer !== undefined) cancelTimer(timer); timer = undefined; };
  async function drain() {
    timer = undefined;
    if (disposed || !reasons.size) return;
    if (running) { ready = true; return; }
    ready = false;
    running = true;
    let resolveIdle!: () => void;
    idle = new Promise<void>((resolve) => { resolveIdle = resolve; });
    const current = [...reasons];
    reasons.clear();
    const next = new AbortController();
    controller = next;
    try {
      if (await run(createPlanningRefreshMessage(current), next.signal) === "deferred" && !disposed && !next.signal.aborted) current.forEach((reason) => reasons.add(reason));
    } finally {
      running = false;
      resolveIdle();
      if (ready && !disposed && reasons.size) { ready = false; void drain(); }
    }
  }
  function arm() { clearTimer(); timer = scheduleTimer(() => { void drain(); }, options.delayMs ?? 1000); }
  return {
    enqueue(reason: string) {
      if (disposed) return;
      reasons.add(reason);
      controller?.abort();
      arm();
    },
    resume() { if (!disposed && reasons.size && timer === undefined) arm(); },
    clear() { clearTimer(); reasons.clear(); ready = false; controller?.abort(); },
    async clearAndWait() { clearTimer(); reasons.clear(); ready = false; controller?.abort(); await idle; },
    dispose() { disposed = true; clearTimer(); reasons.clear(); ready = false; controller?.abort(); },
  };
}
