import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "@/features/pantry/seed";
import { ensurePilot } from "@/features/planning/pilot";
import { planningFixtureRecipe } from "./planning-fixtures";
import { createPlanningRefreshMessage, createPlanningRefreshQueue, isPlanningRefresh, planningRefreshFingerprint, planningRefreshSummary, planningResponseChanges, planningResponseCandidates } from "./planning-refresh";

function timers() {
  let id = 0;
  const pending = new Map<number, () => void>();
  return {
    pending,
    schedule(callback: () => void) { pending.set(++id, callback); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel(timer: ReturnType<typeof setTimeout>) { pending.delete(timer as unknown as number); },
    async fire() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach((callback) => callback()); await Promise.resolve(); await Promise.resolve(); },
  };
}

test("rapid planning interactions coalesce once, with no recurring generation timer", async () => {
  const clock = timers();
  const messages: string[] = [];
  const queue = createPlanningRefreshQueue(async (message) => { messages.push(message); return "sent"; }, clock);
  queue.enqueue("you selected Tuesday lunch");
  queue.enqueue("you selected Tuesday lunch");
  queue.enqueue("you’re discussing vegetable pasta");
  assert.equal(clock.pending.size, 1);
  await clock.fire();
  assert.equal(messages.length, 1);
  assert.equal(planningRefreshSummary(messages[0]), "Refresh ideas: you selected Tuesday lunch; you’re discussing vegetable pasta.");
  assert.equal(clock.pending.size, 0);
  queue.resume();
  assert.equal(clock.pending.size, 0);
  queue.dispose();
});

test("a user-authored request has priority and deferred refresh waits for an explicit resume", async () => {
  const clock = timers();
  let manualActive = true;
  let attempts = 0;
  const sent: string[] = [];
  const queue = createPlanningRefreshQueue(async (message) => {
    attempts++;
    if (manualActive) return "deferred";
    sent.push(message); return "sent";
  }, clock);
  queue.enqueue("your kitchen changed");
  await clock.fire();
  assert.equal(attempts, 1);
  assert.deepEqual(sent, []);
  assert.equal(clock.pending.size, 0);
  manualActive = false;
  queue.resume();
  await clock.fire();
  assert.equal(sent.length, 1);
  assert.match(sent[0], /your kitchen changed/);
  assert.equal(clock.pending.size, 0);
});

test("new interactions abort outdated work and keep only one request dispatch in flight", async () => {
  const clock = timers();
  const signals: AbortSignal[] = [];
  const messages: string[] = [];
  let finishFirst!: () => void;
  const first = new Promise<void>((resolve) => { finishFirst = resolve; });
  const queue = createPlanningRefreshQueue(async (message, signal) => {
    messages.push(message); signals.push(signal);
    if (messages.length === 1) await first;
    return "sent";
  }, clock);
  queue.enqueue("Tuesday lunch");
  await clock.fire();
  queue.enqueue("Wednesday dinner");
  assert.equal(signals[0].aborted, true);
  await clock.fire();
  assert.equal(messages.length, 1);
  finishFirst();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(messages.length, 2);
  assert.match(messages[1], /Wednesday dinner/);
  queue.dispose();
  assert.equal(signals[1].aborted, true);
});

test("unmount or mode change drops pending refreshes and aborts in-flight refreshes", async () => {
  const clock = timers();
  let calls = 0;
  const queue = createPlanningRefreshQueue(async () => { calls++; return "sent"; }, clock);
  queue.enqueue("a recipe was selected");
  queue.dispose();
  await clock.fire();
  queue.enqueue("ignored after disposal"); queue.resume();
  assert.equal(calls, 0);
  assert.equal(clock.pending.size, 0);
});

test("a manual enqueue waits until the superseded automatic POST and cancellation have settled", async () => {
  const clock = timers();
  const events: string[] = [];
  let finishPost!: () => void;
  let finishCancel!: () => void;
  const posted = new Promise<void>((resolve) => { finishPost = resolve; });
  const cancelled = new Promise<void>((resolve) => { finishCancel = resolve; });
  const queue = createPlanningRefreshQueue(async (_message, signal) => {
    events.push("automatic POST started");
    await posted;
    if (signal.aborted) { events.push("automatic cancellation started"); await cancelled; }
    return "sent";
  }, clock);
  queue.enqueue("new focus");
  await clock.fire();
  const manual = queue.clearAndWait().then(() => { events.push("manual POST started"); });
  await Promise.resolve();
  assert.deepEqual(events, ["automatic POST started"]);
  finishPost();
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(events, ["automatic POST started", "automatic cancellation started"]);
  finishCancel();
  await manual;
  assert.deepEqual(events, ["automatic POST started", "automatic cancellation started", "manual POST started"]);
  assert.equal(clock.pending.size, 0);
});

test("context fingerprint ignores response bookkeeping but changes for material kitchen and preference updates", () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-08");
  const initial = planningRefreshFingerprint(state);
  const response = structuredClone(state);
  response.pilot.revision++;
  response.pilot.session.messages.push({ id: "reply", role: "assistant", source: "ai", text: "Try this recipe", recipes: [], servings: 2 });
  response.pilot.session.candidates.push(planningFixtureRecipe(state));
  response.pilot.session.focusedRecipeId = response.pilot.session.candidates[0].id;
  response.pilot.session.focusDate = "2026-10-13";
  response.pilot.session.draft = "Keep this unsent message";
  response.pantry.reverse();
  assert.equal(planningRefreshFingerprint(response), initial);
  const purchase = structuredClone(state);
  purchase.pantry[0].quantity++;
  assert.notEqual(planningRefreshFingerprint(purchase), initial);
  const preference = structuredClone(state);
  preference.pilot.members[0].preferences = "Less spicy";
  assert.notEqual(planningRefreshFingerprint(preference), initial);
  const equipment = structuredClone(state);
  equipment.pilot.session.equipment.push("Rice cooker");
  assert.notEqual(planningRefreshFingerprint(equipment), initial);
});

test("advisory responses cannot introduce actions even if the model ignores the refresh instruction", () => {
  const operation = { type: "set_shop_through" as const, date: "2026-10-15" };
  const proposal = { type: "propose" as const, id: "proposal", title: "Change shopping", changes: [operation] };
  const message = createPlanningRefreshMessage(["you selected lunch"]);
  assert.equal(isPlanningRefresh(message), true);
  assert.deepEqual(planningResponseChanges(message, [operation, proposal]), []);
  assert.deepEqual(planningResponseChanges("Shop through next Thursday", [proposal]), [operation]);
  assert.equal(planningRefreshSummary(message), "Refresh ideas: you selected lunch.");
  assert.equal(planningRefreshSummary(message).includes("Do not"), false);
});

test("background ideas preserve the focused recipe snapshot even when the candidate limit is reached", () => {
  const state = ensurePilot(createSampleHousehold(), "2026-10-08");
  const recipe = planningFixtureRecipe(state);
  const session = { ...state.pilot.session, focusedRecipeId: recipe.id, candidates: [recipe, ...Array.from({ length: 29 }, (_, index) => ({ ...recipe, id: `old-${index}` }))] };
  const revised = { ...recipe, minutes: recipe.minutes + 10 };
  const incoming = [revised, { ...recipe, id: "new-idea" }];
  const automatic = planningResponseCandidates(session, incoming, true);
  assert.equal(automatic.length, 30);
  assert.deepEqual(automatic.find((candidate) => candidate.id === recipe.id), recipe);
  assert.ok(automatic.some((candidate) => candidate.id === "new-idea"));
  const manual = planningResponseCandidates(session, incoming, false);
  assert.equal(manual.length, 30);
  assert.deepEqual(manual.find((candidate) => candidate.id === recipe.id), revised);
});
