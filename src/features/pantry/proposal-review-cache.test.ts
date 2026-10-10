import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningProposal } from "@/lib/contracts";
import { ensurePilot, selectProposalChanges } from "@/features/planning/pilot";
import { createSampleHousehold } from "./seed";
import { HOUSEHOLD_STORAGE_KEY, loadHousehold, saveHousehold, readHouseholdCache, readPlanningComposer, readProposalReview, proposalReviewFingerprint, preserveHouseholdRecovery, recoverHouseholdForOwner } from "./storage";

function fixture() {
  const state = ensurePilot(createSampleHousehold(), "2026-10-08");
  const proposal: PlanningProposal = {
    id: "proposal", title: "Tuesday lunch and two extra portions", status: "pending", baseRevision: state.pilot.revision,
    changes: [{ type: "create_batch", batch: { id: "batch", recipe: { id: "rice", name: "Rice", description: "A simple rice side", servings: 2, minutes: 20, ingredients: [{ ingredientId: "rice", name: "Rice", quantity: 200, unit: "g" }], steps: ["Cook the rice in water until tender."] }, prepareDate: "2026-10-13", yield: 4, reservedExtra: 2 },
      allocations: state.pilot.members.map((member) => ({ id: `allocation-${member.id}`, memberId: member.id, batchId: "batch", date: "2026-10-13", slot: "lunch", portions: 1 })) },
    { type: "set_shop_through", date: "2026-10-13" }],
  };
  state.pilot.proposals = [proposal];
  const review = { proposalId: proposal.id, fingerprint: proposalReviewFingerprint(proposal), excludedAllocationIds: ["allocation-partner"], includeOtherChanges: true };
  const composer = { sessionId: state.pilot.session.id, draft: "Keep my draft", mode: "local" as const, proposalReviews: [review] };
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { state, proposal, review, composer, values, storage };
}

test("partial proposal review resumes from the existing cache and applies the same portions and explicit extra effects", () => {
  const { state, proposal, composer, values, storage } = fixture();
  const original = structuredClone(state);
  saveHousehold(storage, state, { ownerId: "owner", householdId: "kitchen", planningComposer: composer });
  assert.deepEqual([...values.keys()], [HOUSEHOLD_STORAGE_KEY]);
  const loaded = loadHousehold(storage)!;
  assert.deepEqual(loaded, original);
  const resumed = readHouseholdCache(storage).planningComposer!;
  assert.deepEqual(resumed, composer);
  const choice = readProposalReview(resumed.proposalReviews![0], loaded.pilot!.proposals[0])!;
  const placements = proposal.changes.flatMap((change) => change.type === "create_batch" ? change.allocations : []);
  const changes = selectProposalChanges(proposal.changes, placements.filter((entry) => !choice.excludedAllocationIds.includes(entry.id)).map((entry) => entry.id), choice.includeOtherChanges);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].type, "create_batch");
  if (changes[0].type === "create_batch") {
    assert.equal(changes[0].batch.yield, 3);
    assert.equal(changes[0].batch.reservedExtra, 2);
    assert.deepEqual(changes[0].allocations.map((entry) => entry.memberId), ["you"]);
  }
  assert.deepEqual(changes[1], { type: "set_shop_through", date: "2026-10-13" });
  const typed = readPlanningComposer({ ...resumed, draft: "Another unsent message" }, state.pilot.session.id, state.pilot.proposals)!;
  assert.deepEqual(typed.proposalReviews, resumed.proposalReviews);
  assert.equal(loaded.pilot!.revision, original.pilot.revision);
});

test("review choices survive conversation revisions but expire for changed, removed, stale, or applied proposals", () => {
  const { state, proposal, composer } = fixture();
  const read = (proposals: PlanningProposal[]) => readPlanningComposer(composer, state.pilot.session.id, proposals);
  assert.deepEqual(read([{ ...proposal, baseRevision: proposal.baseRevision + 1 }])?.proposalReviews, composer.proposalReviews);
  const changed = structuredClone(proposal);
  if (changed.changes[0].type === "create_batch") changed.changes[0].allocations[0].date = "2026-10-14";
  for (const proposals of [[], [changed], [{ ...proposal, title: "Different review" }], [{ ...proposal, status: "stale" as const }], [{ ...proposal, status: "applied" as const }]]) {
    assert.equal(read(proposals)?.proposalReviews, undefined);
    assert.equal(read(proposals)?.draft, composer.draft);
  }
  assert.equal(readPlanningComposer(composer, "different-session", [proposal]), undefined);
});

test("invalid review metadata falls back without discarding the composer or household", () => {
  const { state, proposal, composer, review, storage } = fixture();
  for (const invalid of [{ ...review, excludedAllocationIds: ["unknown"] }, { ...review, excludedAllocationIds: ["allocation-partner", "allocation-partner"] }, { ...review, includeOtherChanges: "yes" }, { ...review, fingerprint: "old" }, null]) {
    const loaded = readPlanningComposer({ ...composer, proposalReviews: [invalid] }, state.pilot.session.id, [proposal]);
    assert.equal(loaded?.proposalReviews, undefined);
    assert.equal(loaded?.draft, composer.draft);
  }
  saveHousehold(storage, state, { ownerId: null, householdId: null, planningComposer: { sessionId: composer.sessionId, draft: "Old saved draft", mode: "fixture" } });
  assert.deepEqual(readHouseholdCache(storage).planningComposer, { sessionId: composer.sessionId, draft: "Old saved draft", mode: "fixture" });
  assert.deepEqual(loadHousehold(storage), state);
});

test("proposal review metadata follows account recovery without leaking the owner's choices to a partner", () => {
  const { state, composer, storage } = fixture();
  saveHousehold(storage, state, { ownerId: "owner", householdId: "kitchen", planningComposer: composer });
  preserveHouseholdRecovery(storage, "Before partner sign-in");
  const partnerComposer = { ...composer, proposalReviews: [{ ...composer.proposalReviews[0], excludedAllocationIds: [], includeOtherChanges: false }] };
  saveHousehold(storage, state, { ownerId: "partner", householdId: "kitchen", planningComposer: partnerComposer });
  assert.deepEqual(readHouseholdCache(storage).planningComposer?.proposalReviews, partnerComposer.proposalReviews);
  assert.deepEqual(recoverHouseholdForOwner(storage, "owner")?.cache.planningComposer?.proposalReviews, composer.proposalReviews);
  assert.equal(recoverHouseholdForOwner(storage, "another-account"), null);
});
