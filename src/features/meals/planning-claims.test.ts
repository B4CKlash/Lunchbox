import assert from "node:assert/strict";
import test from "node:test";
import { claimsCompletedAction, favoriteClaimFacts } from "./planning-claims";
import type { Recipe } from "@/lib/contracts";

test("completed-action guard covers active, passive, abbreviated, and completion-prefixed claims", () => {
  for (const reply of [
    "I already scheduled your meal.", "We have successfully saved this.",
    "Done—your Tuesday lunch is scheduled.", "Your meals were added.",
    "The purchase was already recorded.", "Scheduled all your meals.",
    "All set!", "Your rating has been updated.", "I just consumed the portions.",
    "No purchase was recorded; but I added a meal.",
    "No worries, I saved your recipe.", "No problem, I've added it.",
  ]) assert.equal(claimsCompletedAction(reply), true, reply);
});

test("factual favorite descriptions require named exact read-only evidence", () => {
  const recipe: Recipe = { id: "saved-pasta", name: "Tomato spinach pasta", description: "Saved recipe", minutes: 25, servings: 2, ingredients: [{ ingredientId: "pasta", name: "Dry pasta", quantity: 200, unit: "g" }], steps: ["Cook pasta."], provenance: { source: "import", method: "text" } };
  const facts = favoriteClaimFacts([recipe], { recipes: [recipe], operations: [] });
  for (const reply of ["Tomato spinach pasta is marked as a favorite.", "'Tomato spinach pasta' recipe, which is marked as a favorite, is available to discuss."]) {
    assert.equal(claimsCompletedAction(reply, facts), false);
    assert.equal(claimsCompletedAction(reply), true);
    assert.equal(claimsCompletedAction(reply, ["A different recipe"]), true);
  }
  for (const reply of ["I marked Tomato spinach pasta as a favorite.", "Tomato spinach pasta is now marked as a favorite.", "Tomato spinach pasta has been saved.", "Tomato spinach pasta was marked as a favorite.", "Unknown curry is marked as a favorite.", "Fake Tomato spinach pasta is marked as a favorite.", "Tomato spinach pasta sounds good and Unknown curry is marked as a favorite.", "Tomato spinach pasta is saved in your recipe box."]) assert.equal(claimsCompletedAction(reply, facts), true, reply);
  assert.deepEqual(favoriteClaimFacts([], { recipes: [recipe], operations: [] }), []);
  assert.deepEqual(favoriteClaimFacts([recipe], { recipes: [{ ...recipe, minutes: 10 }], operations: [] }), []);
  assert.deepEqual(favoriteClaimFacts([recipe], { recipes: [recipe], operations: [{ type: "record_feedback" }] }), []);
});

test("advice, user-reported actions, and explicit negatives do not claim an assistant mutation", () => {
  for (const reply of [
    "I suggest scheduling Tuesday lunch.", "Review this purchase proposal.",
    "You said you cooked six portions; I suggest recording them.",
    "No meals were added.", "None of your meals were changed.",
    "Your meals were not scheduled.", "I have not saved anything.",
    "I haven't scheduled a meal.", "The recipe is ready for review.",
  ]) assert.equal(claimsCompletedAction(reply), false, reply);
});
