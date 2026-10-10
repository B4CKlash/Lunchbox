import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema } from "@/lib/contracts";
import { ensurePilot } from "@/features/planning/pilot";
import { applyHouseholdAction } from "./workspace-state";
import { buildRecommendationContext, recommendationContextKey } from "./recommendation-context";

const household = () => ensurePilot(householdStateSchema.parse({ version: 1, pantry: [], meals: [], preferences: { servings: 2, maxMinutes: 30, prioritizeUseSoon: true } }), "2026-10-12");

test("recommendation identity changes for meaningful personal and kitchen knowledge only", () => {
  const state = household();
  const original = recommendationContextKey(state, state.pilot.members[0].id);
  const bookkeeping = structuredClone(state);
  bookkeeping.pilot.revision++;
  bookkeeping.workspace.chatDraft = "An unsent draft";
  bookkeeping.pilot.session.messages.push({ id: "m1", role: "assistant", text: "An idea", recipes: [], servings: 2 });
  bookkeeping.workspace.suggestions.recentRecipeNames.push("Something new");
  assert.equal(recommendationContextKey(bookkeeping, state.pilot.members[0].id), original);
  bookkeeping.pilot.members[0].preferences = "No mushrooms";
  assert.notEqual(recommendationContextKey(bookkeeping, state.pilot.members[0].id), original);
  assert.notEqual(recommendationContextKey(state, state.pilot.members[1].id), original);
  bookkeeping.pilot.session.equipment = ["Blender"];
  assert.deepEqual(buildRecommendationContext(bookkeeping).equipment, ["Blender"]);
});

test("late feed response cannot append against a changed personal profile", () => {
  const state = household();
  const input = { pantry: state.pantry, preferences: state.preferences, recommendationActorId: state.pilot.members[0].id, recommendationKey: recommendationContextKey(state, state.pilot.members[0].id) };
  state.pilot.members[0].preferences = "No mushrooms";
  const before = structuredClone(state);
  assert.equal(applyHouseholdAction(state, { type: "appendSuggestionBlock", input, block: { id: "old", sequence: 1, direction: "", contextKey: input.recommendationKey, servings: 2, source: "demo", recipes: [] } }), state);
  assert.deepEqual(state, before);
});

test("recommendation context retains opposing personal feedback", () => {
  const state = household();
  const [a, b] = state.pilot.members;
  state.pilot.feedback = [
    { id: "a", memberId: a.id, recipeId: "r", rating: 5, makeAgain: true, notes: "Loved it" },
    { id: "b", memberId: b.id, recipeId: "r", rating: 1, makeAgain: false, notes: "Too spicy" },
  ];
  assert.equal(buildRecommendationContext(state, a.id).feedback.length, 2);
  state.pilot.session.memberIds = [a.id];
  assert.deepEqual(buildRecommendationContext(state, a.id).feedback.map((entry) => entry.memberId), [a.id]);
});
