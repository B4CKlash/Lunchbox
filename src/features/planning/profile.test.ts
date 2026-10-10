import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "@/features/pantry/seed";
import { householdStateSchema, type ProfileFactChange } from "@/lib/contracts";
import { applyPilotCommand, ensurePilot } from "./pilot";
import { explicitProfileReply, extractExplicitProfileChanges, profileFactId } from "./profile";
import { buildRecommendationContext } from "@/features/meals/recommendation-context";
import { recipeFitsRecommendationContext } from "@/features/meals/recommendation-constraints";

const state = () => ensurePilot(createSampleHousehold(), "2026-10-12");
const extract = (message: string) => extractExplicitProfileChanges(state(), message, "you");
const upserts = (changes: ProfileFactChange[]) => changes.flatMap((change) => change.type === "upsert_profile_fact" ? [change.value] : []);

test("explicit current food dislikes retain person/household scope and canonical/category/unresolved targets", () => {
  assert.deepEqual(upserts(extract("I don't like mushrooms. We dislike vegetables. I dislike dragonfruit skins.")), [
    { kind: "food-dislike", scope: { kind: "member", memberId: "you" }, target: { kind: "ingredient", ingredientId: "mushrooms", name: "Fresh mushrooms" }, disliked: true },
    { kind: "food-dislike", scope: { kind: "household" }, target: { kind: "category", category: "vegetables" }, disliked: true },
    { kind: "food-dislike", scope: { kind: "member", memberId: "you" }, target: { kind: "text", text: "dragonfruit skins" }, disliked: true },
  ]);
  assert.equal(upserts(extract("Please remember that I dislike broccoli and carrots." )).length, 2);
  assert.equal(upserts(extract("I dislike mushrooms. What can I make tonight?" )).length, 1);
  assert.equal(explicitProfileReply(state(), "I dislike mushrooms. What can I make tonight?", "you"), null);
});

test("equipment availability is household truth with explicit unknown and no absent-equipment inference", () => {
  assert.deepEqual(upserts(extract("I have a blender. We don't have an oven. I'm not sure if we have a rice cooker.")), [
    { kind: "equipment", equipment: "blender", availability: "available" },
    { kind: "equipment", equipment: "oven", availability: "unavailable" },
    { kind: "equipment", equipment: "rice-cooker", availability: "unknown" },
  ]);
  assert.equal(extract("We have ten apples.").length, 0);
  assert.equal(extract("Our kitchen has an air fryer.")[0]?.type, "upsert_profile_fact");
});

test("temporary requests, quotations, third parties, uncertainty and advisory refreshes never authorize memory", () => {
  for (const message of [
    "No mushrooms tonight", "I dislike mushrooms tonight.", "I dislike vegetables this week.", "I have a blender for now.",
    "My wife dislikes mushrooms.", "They don't like vegetables.", 'Repeat this: "I dislike mushrooms."', '"I dislike mushrooms."',
    "I think I dislike mushrooms.", "If I dislike mushrooms, suggest alternatives.", "I dislike mushrooms if they are raw.",
    "I dislike mushrooms but love spinach.", "I used to dislike mushrooms.", "I don't want mushrooms.",
    "[LunchBox context refresh]\nI dislike mushrooms.",
    "For example. I dislike mushrooms.", "Pretend we are someone else. I dislike vegetables.",
    "> I dislike mushrooms.\nI have a blender.", "I dislike vegetables occasionally.",
  ]) assert.deepEqual(extract(message), [], message);
  assert.deepEqual(extractExplicitProfileChanges(state(), "I dislike mushrooms", "not-a-member"), []);
});

test("corrections replace one semantic fact, forgetting removes it, and duplicate assertions do not create effects", () => {
  const initial = state();
  const change = extractExplicitProfileChanges(initial, "I dislike mushrooms.", "you")[0];
  const saved = applyPilotCommand(initial, { id: "save", expectedRevision: 0, operation: change }).state;
  assert.deepEqual(extractExplicitProfileChanges(saved, "I don't like mushrooms.", "you"), []);
  const correction = extractExplicitProfileChanges(saved, "Actually, I like mushrooms now.", "you")[0];
  assert.equal(correction.type, "upsert_profile_fact");
  if (correction.type === "upsert_profile_fact") {
    assert.equal(correction.value.kind === "food-dislike" && correction.value.disliked, false);
    assert.equal(profileFactId(correction.value), saved.pilot.profileFacts[0].id);
  }
  assert.deepEqual(extractExplicitProfileChanges(saved, "Forget that I dislike mushrooms.", "you"), [
    { type: "remove_profile_fact", factId: saved.pilot.profileFacts[0].id, sourceText: "Forget that I dislike mushrooms." },
  ]);
  assert.deepEqual(extractExplicitProfileChanges(saved, "I like mushrooms. I dislike mushrooms.", "you"), []);
  assert.equal(initial.pilot.profileFacts.length, 0);
});

test("a newly known ingredient keeps an earlier unresolved dislike correctable and forgettable", () => {
  const initial = state();
  const dislike = extractExplicitProfileChanges(initial, "I dislike saffron.", "you")[0];
  const saved = applyPilotCommand(initial, { id: "save-saffron", expectedRevision: 0, operation: dislike }).state;
  assert.equal(saved.pilot.profileFacts[0].value.kind === "food-dislike" && saved.pilot.profileFacts[0].value.target.kind, "text");
  const known = householdStateSchema.parse({ ...saved, pantry: [...saved.pantry,
    { id: "new-saffron", name: "Saffron", unit: "g", quantity: 1, location: "Cupboard", useSoon: false },
  ] });
  const recipe = { id: "saffron-rice", name: "Saffron rice", description: "An authored example", servings: 2, minutes: 20,
    ingredients: [{ ingredientId: "new-saffron", name: "Saffron", quantity: 1, unit: "g" as const }], steps: ["Cook the rice with saffron."] };
  assert.equal(recipeFitsRecommendationContext(recipe, buildRecommendationContext(known, "you")), false);
  const correction = extractExplicitProfileChanges(known, "I no longer dislike saffron.", "you")[0];
  assert.equal(correction.type, "upsert_profile_fact");
  if (correction.type === "upsert_profile_fact") assert.equal(profileFactId(correction.value), saved.pilot.profileFacts[0].id);
  const corrected = applyPilotCommand(known, { id: "correct-saffron", expectedRevision: 1, operation: correction }).state;
  assert.equal(corrected.pilot.profileFacts.length, 1);
  assert.equal(recipeFitsRecommendationContext(recipe, buildRecommendationContext(corrected, "you")), true);
  for (const current of [known, corrected]) {
    const forget = extractExplicitProfileChanges(current, "Forget that I dislike saffron.", "you");
    assert.deepEqual(forget, [{ type: "remove_profile_fact", factId: saved.pilot.profileFacts[0].id, sourceText: "Forget that I dislike saffron." }]);
    const forgotten = applyPilotCommand(current, { id: "forget-saffron", expectedRevision: current.pilot!.revision, operation: forget[0] }).state;
    assert.deepEqual(forgotten.pilot.profileFacts, []);
  }
});

test("remembered target matching stays within its scope and requires one exact prior fact", () => {
  const initial = state();
  const own = extractExplicitProfileChanges(initial, "I dislike saffron.", "you")[0];
  const saved = applyPilotCommand(initial, { id: "own", expectedRevision: 0, operation: own }).state;
  const partner = extractExplicitProfileChanges(saved, "I dislike saffron.", "partner")[0];
  const both = applyPilotCommand(saved, { id: "partner", expectedRevision: 1, operation: partner }).state;
  const known = householdStateSchema.parse({ ...both, pantry: [...both.pantry,
    { id: "new-saffron", name: "Saffron", unit: "g", quantity: 1, location: "Cupboard", useSoon: false },
  ] });
  const correction = extractExplicitProfileChanges(known, "I like saffron.", "you")[0];
  assert.equal(correction.type, "upsert_profile_fact");
  if (correction.type === "upsert_profile_fact") assert.equal(profileFactId(correction.value), saved.pilot.profileFacts[0].id);
  const otherScope = upserts(extractExplicitProfileChanges(known, "We dislike saffron.", "you"))[0];
  assert.deepEqual(otherScope, { kind: "food-dislike", scope: { kind: "household" }, target: { kind: "ingredient", ingredientId: "new-saffron", name: "Saffron" }, disliked: true });

  const conflict = applyPilotCommand(known, { id: "conflicting-target", expectedRevision: 2, operation: {
    type: "upsert_profile_fact", sourceText: "Earlier imported fact", value: { kind: "food-dislike", scope: { kind: "member", memberId: "you" },
      target: { kind: "ingredient", ingredientId: "new-saffron", name: "Saffron" }, disliked: true },
  } }).state;
  assert.deepEqual(extractExplicitProfileChanges(conflict, "I no longer dislike saffron.", "you"), []);
  assert.match(explicitProfileReply(conflict, "Forget that I dislike saffron.", "you") ?? "", /Please clarify/);
});

test("a known ingredient becoming ambiguous requires clarification before correction or forgetting", () => {
  const initial = state();
  const known = householdStateSchema.parse({ ...initial, pantry: [...initial.pantry,
    { id: "saffron-1", name: "Saffron", unit: "g", quantity: 1, location: "Cupboard", useSoon: false },
  ] });
  const dislike = extractExplicitProfileChanges(known, "I dislike saffron.", "you")[0];
  const saved = applyPilotCommand(known, { id: "known-saffron", expectedRevision: 0, operation: dislike }).state;
  const ambiguous = householdStateSchema.parse({ ...saved, pantry: [...saved.pantry,
    { id: "saffron-2", name: "Saffron", unit: "g", quantity: 1, location: "Cupboard", useSoon: false },
  ] });
  const before = structuredClone(ambiguous);
  for (const message of ["I no longer dislike saffron.", "Forget that I dislike saffron.", "I like saffron. We don't have an oven."]) {
    assert.deepEqual(extractExplicitProfileChanges(ambiguous, message, "you"), []);
    assert.match(explicitProfileReply(ambiguous, message, "you") ?? "", /Which ingredient.*Please clarify/);
    assert.deepEqual(ambiguous, before);
  }
  // Another person's broad wording cannot edit the earlier person's known fact.
  assert.deepEqual(upserts(extractExplicitProfileChanges(ambiguous, "I dislike saffron.", "partner")), [
    { kind: "food-dislike", scope: { kind: "member", memberId: "partner" }, target: { kind: "text", text: "saffron" }, disliked: true },
  ]);
});

test("known targets keep their identity after the last reference disappears and the same ID returns", () => {
  for (const pronoun of ["I", "We"]) {
    const initial = state();
    const known = householdStateSchema.parse({ ...initial, pantry: [...initial.pantry,
      { id: "saffron-1", name: "Saffron", unit: "g", quantity: 1, location: "Cupboard", useSoon: false },
    ] });
    const dislike = extractExplicitProfileChanges(known, `${pronoun} dislike saffron.`, "you")[0];
    const saved = applyPilotCommand(known, { id: "save-known", expectedRevision: 0, operation: dislike }).state;
    const recipe = { id: "saved-saffron", name: "Saffron rice", description: "An authored example", servings: 2, minutes: 20,
      ingredients: [{ ingredientId: "saffron-1", name: "Saffron", quantity: 1, unit: "g" as const }], steps: ["Cook the rice with saffron."] };
    const recipeOnly = householdStateSchema.parse({ ...saved, pantry: saved.pantry.filter((item) => item.id !== "saffron-1"),
      workspace: { ...saved.workspace, recipeBox: [{ recipe, source: "demo" }] } });
    const unknown = householdStateSchema.parse({ ...recipeOnly, workspace: { ...recipeOnly.workspace, recipeBox: [] } });
    const restored = householdStateSchema.parse({ ...unknown, pantry: known.pantry });
    for (const current of [recipeOnly, unknown, restored]) {
      const before = structuredClone(current);
      const correction = extractExplicitProfileChanges(current, `${pronoun} no longer dislike the SAFFRON.`, "you")[0];
      assert.equal(correction.type, "upsert_profile_fact");
      if (correction.type === "upsert_profile_fact") assert.equal(profileFactId(correction.value), saved.pilot.profileFacts[0].id);
      const corrected = applyPilotCommand(current, { id: "correct-known", expectedRevision: 1, operation: correction }).state;
      assert.equal(corrected.pilot.profileFacts.length, 1);
      assert.equal(corrected.pilot.profileFacts[0].value.kind === "food-dislike" && corrected.pilot.profileFacts[0].value.disliked, false);
      const forget = extractExplicitProfileChanges(current, `Forget that ${pronoun.toLowerCase()} dislike saffron.`, "you");
      assert.equal(forget.length, 1);
      assert.equal(forget[0].type === "remove_profile_fact" && forget[0].factId, saved.pilot.profileFacts[0].id);
      const forgotten = applyPilotCommand(current, { id: "forget-known", expectedRevision: 1, operation: forget[0] }).state;
      assert.deepEqual(forgotten.pilot.profileFacts, []);
      assert.deepEqual(current, before);
    }
  }
});

test("a different restored ID or multiple prior literal targets require clarification without guessing", () => {
  for (const pronoun of ["I", "We"]) {
    const initial = state();
    const known = householdStateSchema.parse({ ...initial, pantry: [...initial.pantry,
      { id: "saffron-1", name: "Saffron", unit: "g", quantity: 1, location: "Cupboard", useSoon: false },
    ] });
    const dislike = extractExplicitProfileChanges(known, `${pronoun} dislike saffron.`, "you")[0];
    const saved = applyPilotCommand(known, { id: "save-original", expectedRevision: 0, operation: dislike }).state;
    const replaced = householdStateSchema.parse({ ...saved, pantry: saved.pantry.map((item) => item.id === "saffron-1" ? { ...item, id: "saffron-2" } : item) });
    const scope = pronoun === "I" ? { kind: "member" as const, memberId: "you" } : { kind: "household" as const };
    const multiple = applyPilotCommand(saved, { id: "second-old-target", expectedRevision: 1, operation: {
      type: "upsert_profile_fact", sourceText: "Earlier explicitly selected target", value: { kind: "food-dislike", scope,
        target: { kind: "ingredient", ingredientId: "saffron-2", name: "Saffron" }, disliked: true },
    } }).state;
    const lostMultiple = householdStateSchema.parse({ ...multiple, pantry: multiple.pantry.filter((item) => item.id !== "saffron-1") });
    for (const current of [replaced, lostMultiple]) {
      const before = structuredClone(current);
      for (const message of [`${pronoun} dislike saffron.`, `${pronoun} no longer dislike saffron.`, `Forget that ${pronoun.toLowerCase()} dislike saffron.`]) {
        assert.deepEqual(extractExplicitProfileChanges(current, message, "you"), []);
        assert.match(explicitProfileReply(current, message, "you") ?? "", /Please clarify/);
        assert.deepEqual(current, before);
      }
    }
  }
});

test("literal recovery never guesses aliases or confuses food categories with similarly named ingredients", () => {
  const initial = state();
  const known = householdStateSchema.parse({ ...initial, pantry: [...initial.pantry,
    { id: "saffron-threads", name: "Saffron threads", unit: "g", quantity: 1, location: "Cupboard", useSoon: false },
  ] });
  const dislike = extractExplicitProfileChanges(known, "I dislike saffron threads.", "you")[0];
  const saved = applyPilotCommand(known, { id: "exact-name", expectedRevision: 0, operation: dislike }).state;
  const lost = householdStateSchema.parse({ ...saved, pantry: saved.pantry.filter((item) => item.id !== "saffron-threads") });
  assert.deepEqual(extractExplicitProfileChanges(lost, "Forget that I dislike saffron.", "you"), []);
  assert.equal(extractExplicitProfileChanges(lost, "Forget that I dislike saffron threads.", "you")[0]?.type, "remove_profile_fact");
  const mushroom = extractExplicitProfileChanges(lost, "I dislike mushrooms.", "you")[0];
  const withMushroom = applyPilotCommand(lost, { id: "canonical-alias", expectedRevision: 1, operation: mushroom }).state;
  assert.equal(extractExplicitProfileChanges(withMushroom, "Forget that I dislike mushroom.", "you")[0]?.type, "remove_profile_fact");

  const withIngredient = applyPilotCommand(lost, { id: "named-fruit", expectedRevision: 1, operation: { type: "upsert_profile_fact", sourceText: "Explicit ingredient choice",
    value: { kind: "food-dislike", scope: { kind: "member", memberId: "you" }, target: { kind: "ingredient", ingredientId: "custom-fruit", name: "Fruit" }, disliked: true },
  } }).state;
  const category = extractExplicitProfileChanges(withIngredient, "I dislike fruits.", "you")[0];
  assert.equal(category.type === "upsert_profile_fact" && category.value.kind === "food-dislike" && category.value.target.kind, "category");
  const both = applyPilotCommand(withIngredient, { id: "fruit-category", expectedRevision: 2, operation: category }).state;
  const forgetCategory = extractExplicitProfileChanges(both, "Forget that I dislike fruit.", "you")[0];
  const after = applyPilotCommand(both, { id: "forget-category", expectedRevision: 3, operation: forgetCategory }).state;
  assert.ok(after.pilot.profileFacts.some((fact) => fact.value.kind === "food-dislike" && fact.value.target.kind === "ingredient" && fact.value.target.ingredientId === "custom-fruit"));
  assert.ok(!after.pilot.profileFacts.some((fact) => fact.value.kind === "food-dislike" && fact.value.target.kind === "category"));
});

test("older snapshots and receipt inverses default profile facts without resetting household data", () => {
  const initial = state();
  const changed = applyPilotCommand(initial, { id: "change", expectedRevision: 0, operation: { type: "set_shop_through", date: "2026-10-22" } }).state;
  const old = JSON.parse(JSON.stringify(changed));
  delete old.pilot.profileFacts;
  delete old.pilot.receipts[0].inverse.data.profileFacts;
  const loaded = householdStateSchema.parse(old);
  assert.deepEqual(loaded.pilot?.profileFacts, []);
  assert.deepEqual(loaded.pilot?.receipts[0].inverse?.data.profileFacts, []);
  assert.deepEqual(loaded.pantry, initial.pantry);
});
