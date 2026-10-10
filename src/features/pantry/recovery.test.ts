import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "./seed";
import { HOUSEHOLD_RECOVERY_KEY, HOUSEHOLD_STORAGE_KEY, preserveHouseholdRecovery, recoverHouseholdForOwner, saveHousehold, readHouseholdCache, readPlanningComposer, loadHousehold } from "./storage";
import { ensurePilot } from "@/features/planning/pilot";

const memory = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
test("switching accounts preserves and restores the original pending command and kitchen", () => {
  const storage = memory();
  const owner = createSampleHousehold(); owner.pantry[0].quantity = 123;
  const pending = { commandId: "retry-original-id", expectedRevision: 5 };
  saveHousehold(storage, owner, { ownerId: "owner", householdId: "household", pending });
  preserveHouseholdRecovery(storage, "Account changed");
  saveHousehold(storage, createSampleHousehold(), { ownerId: "partner", householdId: "other-household" });
  preserveHouseholdRecovery(storage, "Account changed again");
  const recovered = recoverHouseholdForOwner(storage, "owner");
  assert.equal(recovered?.state.pantry[0].quantity, 123);
  assert.deepEqual(recovered?.cache.pending, pending);
  assert.equal(recoverHouseholdForOwner(storage, "stranger"), null);
  assert.equal(recoverHouseholdForOwner(storage, null), null);
});

test("guest recovery never restores an authenticated household and legacy guest state is preserved", () => {
  const storage = memory();
  const guest = createSampleHousehold(); guest.workspace.chatDraft = "Original guest note";
  saveHousehold(storage, guest); preserveHouseholdRecovery(storage, "Before sign-in");
  saveHousehold(storage, createSampleHousehold(), { ownerId: "owner", householdId: "household" });
  preserveHouseholdRecovery(storage, "Before sign-out");
  assert.equal(recoverHouseholdForOwner(storage, null)?.state.workspace.chatDraft, "Original guest note");
});

test("recovery failure never overwrites the original save and archives do not evict history", () => {
  const storage = memory(); saveHousehold(storage, createSampleHousehold());
  const original = storage.values.get(HOUSEHOLD_STORAGE_KEY);
  assert.throws(() => preserveHouseholdRecovery({ getItem: storage.getItem, setItem: () => { throw new Error("quota"); } }, "Before migration"), /quota/);
  assert.equal(storage.values.get(HOUSEHOLD_STORAGE_KEY), original);
  preserveHouseholdRecovery(storage, "Before migration");
  preserveHouseholdRecovery(storage, "Same bytes only need one copy");
  assert.equal(JSON.parse(storage.values.get(HOUSEHOLD_RECOVERY_KEY)!).length, 1);
});

test("browser composer survives reload in the existing owner-scoped envelope without changing household revision", () => {
  const storage = memory(); const state = ensurePilot(createSampleHousehold());
  const planningComposer = { sessionId: state.pilot.session.id, draft: "Lunch for my partner", mode: "local" as const };
  saveHousehold(storage, state, { ownerId: "owner", householdId: "household", planningComposer });
  assert.deepEqual(readHouseholdCache(storage).planningComposer, planningComposer);
  assert.equal(loadHousehold(storage)?.pilot?.revision, state.pilot.revision);
  assert.equal(loadHousehold(storage)?.pilot?.session.draft, "");
  preserveHouseholdRecovery(storage, "Before partner sign-in");
  saveHousehold(storage, state, { ownerId: "partner", householdId: "household", planningComposer: { ...planningComposer, draft: "Partner's separate draft" } });
  assert.equal(recoverHouseholdForOwner(storage, "owner")?.cache.planningComposer?.draft, "Lunch for my partner");
  assert.equal(readHouseholdCache(storage).planningComposer?.draft, "Partner's separate draft");
  assert.equal(readPlanningComposer(planningComposer, "different-session"), undefined);
  assert.equal(readPlanningComposer({ ...planningComposer, draft: "x".repeat(2001) }, state.pilot.session.id), undefined);
  assert.deepEqual([...storage.values.keys()].sort(), [HOUSEHOLD_RECOVERY_KEY, HOUSEHOLD_STORAGE_KEY].sort());
});
