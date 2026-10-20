import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@/lib/contracts";
import { ensurePilot } from "@/features/planning/pilot";
import { createSampleHousehold } from "./seed";
import { HOUSEHOLD_STORAGE_KEY, loadHousehold, preserveHouseholdRecovery, readHouseholdCache, readPlanningComposer, recoverHouseholdForOwner, saveHousehold, type CachedPlanningComposer, type PlanningJourney } from "./storage";

const recipe: Recipe = {
  id: "rice-bowl", name: "Rice bowl", description: "A saved candidate for dinner.", servings: 2, minutes: 20,
  ingredients: [{ ingredientId: "rice", name: "Rice", quantity: 200, unit: "g" }],
  steps: ["Simmer the rice until tender."], provenance: { source: "ai" },
};
const composer = (journey?: PlanningJourney): CachedPlanningComposer => ({
  sessionId: "household-planning", draft: "Keep my unsent request", mode: "local", ...(journey ? { journey } : {}),
});
const memory = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test("journey stage and shortlist snapshots round-trip in the existing cache without changing household data", () => {
  const storage = memory();
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  const original = structuredClone(state);
  const planningComposer = composer({ stage: "groceries", shortlist: [recipe], portionDrafts: { [recipe.id]: "2.5" } });
  saveHousehold(storage, state, { ownerId: "nate", householdId: "kitchen", planningComposer });
  assert.deepEqual([...storage.values.keys()], [HOUSEHOLD_STORAGE_KEY]);
  assert.deepEqual(readHouseholdCache(storage).planningComposer, planningComposer);
  assert.deepEqual(loadHousehold(storage), original);

  state.pilot.session.candidates = [{ ...recipe, id: "rerolled-recipe", name: "Another idea" }];
  saveHousehold(storage, state, { ownerId: "nate", householdId: "kitchen", planningComposer });
  assert.deepEqual(readHouseholdCache(storage).planningComposer?.journey?.shortlist, [recipe]);
  assert.equal(loadHousehold(storage)?.pilot?.revision, original.pilot.revision);
});

test("every journey stage accepts an empty shortlist and ten distinct validated snapshots", () => {
  const shortlist = Array.from({ length: 10 }, (_, index) => ({ ...recipe, id: `recipe-${index}` }));
  for (const stage of ["ideas", "recipe", "groceries", "plan", "calendar"] as const) {
    for (const snapshots of [[], shortlist]) {
      const input = composer({ stage, shortlist: snapshots });
      assert.deepEqual(readPlanningComposer(input, input.sessionId), input);
    }
  }
  const input = composer({ stage: "ideas", shortlist: [recipe] });
  const parsed = readPlanningComposer(input, input.sessionId)!;
  parsed.journey!.shortlist[0].ingredients[0].quantity = 50;
  assert.equal(input.journey!.shortlist[0].ingredients[0].quantity, 200);
});

test("older composer caches remain valid and do not invent a journey", () => {
  const original = composer();
  assert.deepEqual(readPlanningComposer(original, original.sessionId), original);
  assert.equal(readPlanningComposer(original, original.sessionId)?.journey, undefined);
  const oldJourney = composer({ stage: "recipe", shortlist: [recipe] });
  assert.deepEqual(readPlanningComposer(oldJourney, oldJourney.sessionId), oldJourney);
  assert.equal(readPlanningComposer(oldJourney, oldJourney.sessionId)?.journey?.portionDrafts, undefined);
});

test("raw portion drafts round-trip without treating incomplete or invalid text as quantities", () => {
  const storage = memory();
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  const original = structuredClone(state);
  for (const draft of ["", "0", "2.5", "1e3", "-", "not a quantity", "9".repeat(32)]) {
    const input = composer({ stage: "groceries", shortlist: [recipe], portionDrafts: { [recipe.id]: draft } });
    saveHousehold(storage, state, { ownerId: "nate", householdId: "kitchen", planningComposer: input });
    const parsed = readHouseholdCache(storage).planningComposer!;
    assert.deepEqual(parsed, input);
    parsed.journey!.portionDrafts![recipe.id] = "changed";
    assert.equal(input.journey!.portionDrafts![recipe.id], draft);
    assert.deepEqual(loadHousehold(storage), original);
  }
  assert.deepEqual([...storage.values.keys()], [HOUSEHOLD_STORAGE_KEY]);
});

test("malformed optional portion drafts preserve the journey and unsent composer", () => {
  const input = composer({ stage: "groceries", shortlist: [recipe] });
  for (const portionDrafts of [null, "4", 4, false, [], ["4"], { [recipe.id]: 4 }, { [recipe.id]: "4".repeat(33) }]) {
    const parsed = readPlanningComposer({ ...input, journey: { ...input.journey, portionDrafts } }, input.sessionId);
    assert.deepEqual(parsed, input);
  }
});

test("portion drafts retain valid entries while pruning malformed, unknown and removed recipe IDs", () => {
  const otherRecipe = { ...recipe, id: "other-recipe" };
  const input = composer({ stage: "groceries", shortlist: [recipe, otherRecipe], portionDrafts: { [recipe.id]: "", [otherRecipe.id]: "6" } });
  const malformed = { ...input, journey: { ...input.journey, portionDrafts: { [recipe.id]: "", [otherRecipe.id]: null, unknown: "2" } } };
  assert.deepEqual(readPlanningComposer(malformed, input.sessionId)?.journey, { stage: "groceries", shortlist: [recipe, otherRecipe], portionDrafts: { [recipe.id]: "" } });
  const removed = { ...input, journey: { ...input.journey, shortlist: [otherRecipe] } };
  assert.deepEqual(readPlanningComposer(removed, input.sessionId)?.journey, { stage: "groceries", shortlist: [otherRecipe], portionDrafts: { [otherRecipe.id]: "6" } });
  assert.equal(input.journey!.portionDrafts![recipe.id], "");
});

test("invalid optional journeys preserve the unsent draft and mode", () => {
  const original = composer();
  const invalid: unknown[] = [
    null, "recipe", {}, { stage: "unknown", shortlist: [] }, { stage: "ideas" },
    { stage: "ideas", shortlist: {} },
    { stage: "ideas", shortlist: Array.from({ length: 11 }, (_, index) => ({ ...recipe, id: `recipe-${index}` })) },
    { stage: "ideas", shortlist: [recipe, { ...recipe, name: "Different snapshot with the same ID" }] },
    { stage: "ideas", shortlist: [recipe, { ...recipe, id: "invalid", servings: 0 }] },
    { stage: "ideas", shortlist: [null] },
  ];
  for (const journey of invalid) assert.deepEqual(readPlanningComposer({ ...original, journey }, original.sessionId), original);
});

test("shortlist recovery follows the account and session instead of leaking into a partner's journey", () => {
  const storage = memory();
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  const nateComposer = composer({ stage: "groceries", shortlist: [recipe], portionDrafts: { [recipe.id]: "" } });
  saveHousehold(storage, state, { ownerId: "nate", householdId: "kitchen", planningComposer: nateComposer });
  preserveHouseholdRecovery(storage, "Before partner sign-in");
  const partnerComposer = composer({ stage: "ideas", shortlist: [] });
  saveHousehold(storage, state, { ownerId: "partner", householdId: "kitchen", planningComposer: partnerComposer });
  assert.deepEqual(readHouseholdCache(storage).planningComposer, partnerComposer);
  assert.deepEqual(recoverHouseholdForOwner(storage, "nate")?.cache.planningComposer, nateComposer);
  assert.equal(recoverHouseholdForOwner(storage, "someone-else"), null);
  assert.equal(readPlanningComposer(nateComposer, "another-planning-session"), undefined);
});

test("a failed journey cache write retains the previous saved shortlist", () => {
  const storage = memory();
  const state = ensurePilot(createSampleHousehold(), "2026-10-12");
  const original = composer({ stage: "groceries", shortlist: [recipe], portionDrafts: { [recipe.id]: "1e3" } });
  saveHousehold(storage, state, { ownerId: "nate", householdId: "kitchen", planningComposer: original });
  assert.throws(() => saveHousehold({ setItem: () => { throw new Error("Quota exceeded"); } }, state, {
    ownerId: "nate", householdId: "kitchen", planningComposer: composer({ stage: "ideas", shortlist: [] }),
  }), /Quota exceeded/);
  assert.deepEqual(readHouseholdCache(storage).planningComposer, original);
});
