import assert from "node:assert/strict";
import test from "node:test";
import { createInventoryExperiment } from "@/features/pantry/sample-inventory";
import { buildRecipeIdeas, recipeIdeaFit } from "./recipe-ideas";
import { profileFactId } from "./profile";
import type { ProfileFactValue } from "@/lib/contracts";

test("discovery ranks known-stock recipes before shortages, without changing household state", () => {
  const state = createInventoryExperiment(false);
  const before = structuredClone(state);
  const ideas = buildRecipeIdeas(state);
  assert.ok(ideas.length > 3 && ideas.length <= 10);
  assert.equal(recipeIdeaFit(state, ideas[0]).ready, true);
  assert.ok(ideas.every((recipe) => recipe.provenance?.source === "demo"));
  assert.deepEqual(state, before);
});

test("unknown package contents stay checks instead of a can-make claim", () => {
  const state = createInventoryExperiment(false);
  const recipe = { ...buildRecipeIdeas(state)[0], ingredients: [{ ingredientId: "beans", name: "Beans", quantity: 1000, unit: "g" as const }] };
  state.pilot!.packageStock.push({ ingredientId: "beans", name: "Beans", packageKind: "can", status: "exact", count: 10 });
  const fit = recipeIdeaFit(state, recipe);
  assert.equal(fit.ready, false);
  assert.equal(fit.checks, 1);
  assert.equal(fit.shortages, 0);
});

test("exploring a starter recipe preserves the other discovery options", () => {
  const state = createInventoryExperiment(false);
  const original = buildRecipeIdeas(state);
  state.pilot!.session.candidates = [original[0]];
  state.pilot!.session.focusedRecipeId = original[0].id;
  assert.deepEqual(new Set(buildRecipeIdeas(state).map((recipe) => recipe.id)), new Set(original.map((recipe) => recipe.id)));
});

test("saved ideas are deduplicated and passed-over recipes stay excluded", () => {
  const state = createInventoryExperiment(false);
  const recipes = buildRecipeIdeas(state);
  state.workspace.recipeBox = recipes.map((recipe) => ({ recipe, source: "demo" }));
  state.pilot!.session.candidates = recipes;
  state.pilot!.session.rejectedRecipeIds = [recipes[0].id];
  const ideas = buildRecipeIdeas(state);
  assert.equal(new Set(ideas.map((recipe) => recipe.id)).size, ideas.length);
  assert.ok(ideas.every((recipe) => recipe.id !== recipes[0].id));
});

test("discovery follows current audience dislikes and unavailable equipment", () => {
  const state = createInventoryExperiment(false);
  const setFact = (value: ProfileFactValue) => {
    state.pilot!.profileFacts = [{ id: profileFactId(value), value,
      source: { kind: "manual", sourceText: "Explicit current fact", commandId: "setup", recordedAt: "2026-10-13T00:00:00.000Z" } }];
  };
  const [first, partner] = state.pilot!.members;
  setFact({ kind: "food-dislike", scope: { kind: "member", memberId: partner.id }, target: { kind: "category", category: "vegetables" }, disliked: true });
  state.pilot!.session.memberIds = [first.id];
  assert.ok(buildRecipeIdeas(state, first.id).length > 0);
  state.pilot!.session.memberIds.push(partner.id);
  assert.equal(buildRecipeIdeas(state, first.id).length, 0);
  setFact({ kind: "equipment", equipment: "oven", availability: "unavailable" });
  assert.ok(buildRecipeIdeas(state).every((recipe) => !recipe.steps.some((step) => /\b(oven|roast|bake)\b/i.test(step))));
});
