import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "@/features/pantry/seed";
import { householdStateSchema, type ProfileFactChange } from "@/lib/contracts";
import { applyPilotCommand, ensurePilot } from "./pilot";
import { explicitProfileReply, extractExplicitProfileChanges, profileFactId } from "./profile";

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
