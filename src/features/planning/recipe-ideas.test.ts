import assert from "node:assert/strict";
import test from "node:test";
import { createInventoryExperiment } from "@/features/pantry/sample-inventory";
import { buildRecommendationContext } from "@/features/meals/recommendation-context";
import { buildRecipeIdeas, recipeFitsIdeaContext, recipeIdeaFit } from "./recipe-ideas";
import { profileFactId } from "./profile";
import { householdStateSchema, type ProfileFactValue, type Recipe } from "@/lib/contracts";

test("discovery ranks known-stock recipes before shortages, without changing household state", () => {
  const state = createInventoryExperiment(false);
  const before = structuredClone(state);
  const ideas = buildRecipeIdeas(state);
  assert.ok(ideas.length > 3 && ideas.length <= 10);
  assert.equal(recipeIdeaFit(state, ideas[0]).ready, true);
  assert.ok(ideas.every((recipe) => recipe.provenance?.source === "demo"));
  assert.deepEqual(state, before);
});

test("suitable saved recipes precede stock-covered candidates and starters without losing alternatives", () => {
  const state = createInventoryExperiment(false);
  const starters = buildRecipeIdeas(state);
  const ready = starters.find((recipe) => recipeIdeaFit(state, recipe).ready)!;
  const saved: Recipe = { ...ready, id: "saved-with-shortages", provenance: { source: "ai" },
    ingredients: [{ ingredientId: "rice", name: "Rice", quantity: 10000, unit: "g" }] };
  const candidate = { ...ready, id: "current-stock-covered", provenance: { source: "ai" as const } };
  state.workspace.recipeBox = [{ recipe: saved, source: "ai" }];
  state.pilot!.session.candidates = [candidate];
  const before = structuredClone(state);
  const ideas = buildRecipeIdeas(state);
  assert.equal(recipeIdeaFit(state, saved).ready, false);
  assert.equal(ideas[0].id, saved.id);
  assert.equal(ideas[0].provenance?.source, "ai");
  assert.ok(ideas.some((recipe) => recipe.id === candidate.id));
  for (const starter of starters) assert.ok(ideas.some((recipe) => recipe.id === starter.id));
  assert.deepEqual(state, before);
});

test("a saved ID keeps its affinity while its newest candidate snapshot and provenance win", () => {
  const state = createInventoryExperiment(false);
  const original = buildRecipeIdeas(state)[0];
  const saved: Recipe = { ...original, id: "saved-current", name: "Earlier imported recipe", provenance: { source: "import", sourceUrl: "https://example.com/earlier-recipe" } };
  const earlierCandidate = { ...saved, name: "Earlier candidate" };
  const latestCandidate: Recipe = { ...saved, name: "Latest candidate", provenance: { source: "ai" },
    ingredients: [{ ingredientId: "rice", name: "Rice", quantity: 10000, unit: "g" }] };
  state.workspace.recipeBox = [{ recipe: saved, source: "import" }];
  state.pilot!.session.candidates = [earlierCandidate, latestCandidate];
  const before = structuredClone(state);
  const ideas = buildRecipeIdeas(state);
  assert.strictEqual(ideas[0], latestCandidate);
  assert.equal(ideas.filter((recipe) => recipe.id === saved.id).length, 1);
  assert.deepEqual(state, before);
});

test("an ineligible current snapshot cannot fall back to an older saved version", () => {
  const cases: Array<{ label: string; patch: Partial<Recipe> }> = [
    { label: "time", patch: { minutes: 60 } },
    { label: "ingredient exclusion", patch: { ingredients: [{ ingredientId: "custom-peanut", name: "Peanut butter", quantity: 100, unit: "g" }] } },
    { label: "equipment", patch: { steps: ["Bake in the oven until tender."] } },
  ];
  for (const { label, patch } of cases) {
    const state = createInventoryExperiment(false);
    const saved: Recipe = { ...buildRecipeIdeas(state)[0], id: "saved-older-fitting", minutes: 15, steps: ["Stir and serve."],
      ingredients: [{ ingredientId: "rice", name: "Rice", quantity: 100, unit: "g" }] };
    state.preferences.maxMinutes = 35;
    state.preferences.allergies = ["peanut"];
    const value: ProfileFactValue = { kind: "equipment", equipment: "oven", availability: "unavailable" };
    state.pilot!.profileFacts = [{ id: profileFactId(value), value,
      source: { kind: "manual", sourceText: "No oven", commandId: "setup", recordedAt: "2026-10-13T00:00:00.000Z" } }];
    state.workspace.recipeBox = [{ recipe: saved, source: "demo" }];
    state.pilot!.session.candidates = [{ ...saved, ...patch }];
    const before = structuredClone(state);
    assert.equal(recipeFitsIdeaContext(saved, buildRecommendationContext(state)), true, label);
    assert.ok(!buildRecipeIdeas(state).some((recipe) => recipe.id === saved.id), label);
    assert.deepEqual(state, before, label);
  }
});

test("saved affinity never bypasses rejected recipes or current make-again feedback", () => {
  const state = createInventoryExperiment(false);
  const original = buildRecipeIdeas(state)[0];
  const saved = ["passed-over", "not-again", "still-welcome"].map((id) => ({ ...original, id }));
  state.workspace.recipeBox = saved.map((recipe) => ({ recipe, source: "demo" }));
  state.pilot!.session.rejectedRecipeIds = [saved[0].id];
  const memberId = state.pilot!.session.memberIds[0];
  state.pilot!.feedback = [
    { id: "earlier-feedback", recipeId: saved[1].id, memberId, rating: 4, makeAgain: true, notes: "" },
    { id: "current-feedback", recipeId: saved[1].id, memberId, rating: 1, makeAgain: false, notes: "" },
  ];
  const before = structuredClone(state);
  const ideas = buildRecipeIdeas(state);
  assert.equal(ideas[0].id, saved[2].id);
  assert.ok(ideas.every((recipe) => recipe.id !== saved[0].id && recipe.id !== saved[1].id));
  assert.deepEqual(state, before);
});

test("saved discovery stays deterministic and bounded to ten eligible recipes", () => {
  const state = createInventoryExperiment(false);
  const original = buildRecipeIdeas(state)[0];
  state.workspace.recipeBox = Array.from({ length: 12 }, (_, index) => ({ recipe: { ...original, id: `saved-${index}` }, source: "demo" as const }));
  const before = structuredClone(state);
  const expected = state.workspace.recipeBox.slice(0, 10).map(({ recipe }) => recipe.id);
  assert.deepEqual(buildRecipeIdeas(state).map((recipe) => recipe.id), expected);
  assert.deepEqual(buildRecipeIdeas(state).map((recipe) => recipe.id), expected);
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

test("ambiguous legacy ingredient aliases do not crash discovery or rewrite saved identities", () => {
  const state = createInventoryExperiment(false);
  const saved = { ...buildRecipeIdeas(state)[0], id: "saved-legacy-tomatoes", ingredients: [
    { ingredientId: "legacy-tomato", name: "Roma tomatoes", quantity: 100, unit: "g" as const },
  ] };
  state.pantry.push({ id: "legacy-tomato", name: "Roma tomatoes", quantity: 300, unit: "g", location: "Fridge", useSoon: false, tag: "special" });
  state.workspace.recipeBox = [{ recipe: saved, source: "demo" }];
  assert.equal(householdStateSchema.safeParse(state).success, true);
  const before = structuredClone(state);
  const ideas = buildRecipeIdeas(state);
  assert.deepEqual(ideas.find((recipe) => recipe.id === saved.id)?.ingredients, saved.ingredients);
  assert.ok(ideas.some((recipe) => recipe.id === "r1"));
  assert.deepEqual(state, before);
});

test("one ambiguous starter leaves other resolvable starter variations available", () => {
  const state = createInventoryExperiment(false);
  state.pantry.push({ id: "legacy-spinach", name: "Baby spinach", quantity: 200, unit: "g", location: "Fridge", useSoon: false, tag: "special" });
  const ideas = buildRecipeIdeas(state);
  assert.ok(!ideas.some((recipe) => recipe.id === "pilot-fixture-quick"));
  for (const variation of ["vegetables", "pasta", "cuisine"]) assert.ok(ideas.some((recipe) => recipe.id === `pilot-fixture-${variation}`));
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

test("current time limits filter starter examples and previously saved or generated snapshots", () => {
  const state = createInventoryExperiment(false);
  const original = buildRecipeIdeas(state)[0];
  const quick = { ...original, id: "saved-quick", minutes: 10, provenance: { source: "ai" as const } };
  const slow = { ...original, id: "saved-slow", minutes: 45, provenance: { source: "ai" as const } };
  state.workspace.recipeBox = [{ recipe: quick, source: "ai" }, { recipe: slow, source: "ai" }];
  state.pilot!.session.candidates = [{ ...slow, id: "earlier-generated" }];
  state.preferences.maxMinutes = 10;
  const before = structuredClone(state);
  assert.deepEqual(buildRecipeIdeas(state).map((recipe) => recipe.id), [quick.id]);
  assert.equal(recipeFitsIdeaContext(slow, buildRecommendationContext(state)), false);
  assert.equal(recipeFitsIdeaContext(quick, buildRecommendationContext(state)), true);
  assert.deepEqual(state, before);

  state.workspace.recipeBox = [];
  state.pilot!.session.candidates = [];
  assert.deepEqual(buildRecipeIdeas(state), []);
});

test("declared ingredient exclusions filter starters and saved snapshots using wording and canonical aliases", () => {
  const state = createInventoryExperiment(false);
  const original = buildRecipeIdeas(state)[0];
  state.preferences.allergies = ["tomato"];
  const starters = buildRecipeIdeas(state);
  assert.ok(starters.length > 0);
  assert.ok(starters.every((recipe) => !recipe.ingredients.some((ingredient) => ingredient.ingredientId === "tomatoes")));

  const peanut = { ...original, id: "saved-peanut", provenance: { source: "ai" as const },
    ingredients: [{ ingredientId: "custom-peanut-butter", name: "Peanut butter", quantity: 100, unit: "g" as const }] };
  state.workspace.recipeBox = [{ recipe: peanut, source: "ai" }];
  state.preferences.allergies = ["PEANUT"];
  assert.ok(!buildRecipeIdeas(state).some((recipe) => recipe.id === peanut.id));
  assert.equal(recipeFitsIdeaContext(peanut, buildRecommendationContext(state)), false);
  assert.deepEqual(state.workspace.recipeBox[0].recipe, peanut);

  const courgette = { ...original, id: "saved-zucchini", ingredients: [
    { ingredientId: "zucchini", name: "Green summer squash", quantity: 1, unit: "each" as const },
  ] };
  state.preferences.allergies = ["courgette"];
  assert.equal(recipeFitsIdeaContext(courgette, buildRecommendationContext(state)), false);
  state.preferences.allergies = [];
  assert.equal(recipeFitsIdeaContext(courgette, buildRecommendationContext(state)), true);
});
