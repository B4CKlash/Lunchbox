import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage, Recipe } from "@/lib/contracts";
import { createSampleHousehold } from "@/features/pantry/seed";
import {
  applyHouseholdAction,
  householdReducer,
  type HouseholdAction,
} from "./workspace-state";

function recipe(id = "rice-meal", quantity = 150): Recipe {
  return {
    id,
    name: "Rice bowl",
    description: "A simple rice bowl.",
    minutes: 20,
    servings: 2,
    ingredients: [
      { ingredientId: "rice", name: "Rice", quantity, unit: "g" },
    ],
    steps: ["Cook the rice."],
  };
}

function message(id: string): ChatMessage {
  return {
    id,
    role: "assistant",
    text: "Here is a demo recipe to consider.",
    source: "demo",
    recipes: [recipe()],
    servings: 2,
  };
}

test("switching entry points retains the draft, saved recipes, focus, and one plan", () => {
  const original = createSampleHousehold();
  const actions: HouseholdAction[] = [
    { type: "saveRecipe", recipe: recipe(), source: "demo" },
    { type: "setChatDraft", text: "Could I use this for dinner?" },
    { type: "addMeal", id: "dinner", recipe: recipe(), servings: 4 },
    { type: "discussRecipe", recipe: recipe(), servings: 4 },
    { type: "setWorkspaceMode", mode: "plan" },
    { type: "setWorkspaceMode", mode: "suggestions" },
  ];
  const state = actions.reduce(applyHouseholdAction, original);
  assert.equal(state.workspace.mode, "suggestions");
  assert.equal(state.workspace.chatDraft, "Could I use this for dinner?");
  assert.equal(state.workspace.focusedRecipe?.id, "rice-meal");
  assert.equal(state.workspace.focusedServings, 4);
  assert.equal(state.preferences.servings, 2);
  assert.equal(state.workspace.recipeBox.length, 1);
  assert.equal(state.meals.length, 1);
  assert.equal(state.meals[0].servings, 4);
  assert.deepEqual(state.pantry, original.pantry);
  assert.deepEqual(original.meals, []);
  assert.deepEqual(original.workspace.recipeBox, []);
});

test("saved recipes and planned meals hold independent recipe snapshots", () => {
  const input = recipe();
  let state = applyHouseholdAction(createSampleHousehold(), {
    type: "saveRecipe",
    recipe: input,
    source: "demo",
  });
  state = applyHouseholdAction(state, {
    type: "addMeal",
    id: "dinner",
    recipe: input,
    servings: 2,
  });
  input.ingredients[0].quantity = 999;
  input.steps[0] = "Changed externally";
  assert.equal(state.meals[0].recipe.ingredients[0].quantity, 150);
  assert.equal(state.workspace.recipeBox[0].recipe.steps[0], "Cook the rice.");

  const previous = state;
  state = applyHouseholdAction(state, {
    type: "saveRecipe",
    recipe: recipe("rice-meal", 200),
    source: "ai",
  });
  assert.equal(state.workspace.recipeBox.length, 1);
  assert.equal(state.workspace.recipeBox[0].source, "ai");
  assert.equal(state.workspace.recipeBox[0].recipe.ingredients[0].quantity, 200);
  assert.equal(state.meals[0].recipe.ingredients[0].quantity, 150);
  assert.equal(previous.workspace.recipeBox[0].recipe.ingredients[0].quantity, 150);

  state.workspace.recipeBox[0].recipe.ingredients[0].quantity = 300;
  assert.equal(state.meals[0].recipe.ingredients[0].quantity, 150);
});

test("recipe removal and plan changes never change pantry stock", () => {
  const original = createSampleHousehold();
  const actions: HouseholdAction[] = [
    { type: "saveRecipe", recipe: recipe(), source: "demo" },
    { type: "addMeal", id: "dinner", recipe: recipe(), servings: 2 },
    { type: "removeSavedRecipe", recipeId: "rice-meal" },
    { type: "setMealServings", id: "dinner", servings: 12 },
  ];
  const state = actions.reduce(applyHouseholdAction, original);
  assert.deepEqual(state.workspace.recipeBox, []);
  assert.equal(state.meals[0].servings, 12);
  assert.deepEqual(state.pantry, original.pantry);
  const removed = applyHouseholdAction(state, { type: "removeMeal", id: "dinner" });
  assert.deepEqual(removed.meals, []);
  assert.deepEqual(removed.pantry, original.pantry);
});

test("saved recipe limit rejects a new entry but allows updating an existing ID", () => {
  const state = createSampleHousehold();
  state.workspace.recipeBox = Array.from({ length: 100 }, (_, index) => ({
    recipe: recipe(`recipe-${index}`),
    source: "demo",
  }));
  const rejected = householdReducer(
    { state, updateError: null },
    { type: "saveRecipe", recipe: recipe("overflow"), source: "demo" },
  );
  assert.equal(rejected.state, state);
  assert.match(rejected.updateError ?? "", /100 saved recipes/);
  const accepted = householdReducer(rejected, {
    type: "saveRecipe",
    recipe: recipe("recipe-0", 200),
    source: "demo",
  });
  assert.equal(accepted.updateError, null);
  assert.equal(accepted.state.workspace.recipeBox.length, 100);
  assert.equal(
    accepted.state.workspace.recipeBox[0].recipe.ingredients[0].quantity,
    200,
  );
});

test("chat retains the most recent twenty validated message snapshots", () => {
  const incoming = Array.from({ length: 22 }, (_, index) => message(`${index}`));
  let state = applyHouseholdAction(createSampleHousehold(), {
    type: "appendChatMessages",
    messages: incoming,
  });
  assert.deepEqual(
    state.workspace.chatMessages.map((entry) => entry.id),
    Array.from({ length: 20 }, (_, index) => `${index + 2}`),
  );
  incoming[21].recipes[0].ingredients[0].quantity = 999;
  assert.equal(state.workspace.chatMessages[19].recipes[0].ingredients[0].quantity, 150);
  state = applyHouseholdAction(state, {
    type: "appendChatMessages",
    messages: [message("newest")],
  });
  assert.equal(state.workspace.chatMessages[0].id, "3");
  assert.equal(state.workspace.chatMessages[19].id, "newest");
});

test("invalid chat and meal edits preserve the last valid state", () => {
  const state = createSampleHousehold();
  state.meals = Array.from({ length: 50 }, (_, index) => ({
    id: `meal-${index}`,
    recipe: recipe(),
    servings: 2,
  }));
  const invalid: HouseholdAction[] = [
    { type: "setChatDraft", text: "x".repeat(1001) },
    { type: "appendChatMessages", messages: [{ ...message("bad"), text: "x".repeat(2001) }] },
    { type: "appendChatMessages", messages: [{ ...message("bad"), servings: 13 }] },
    { type: "setMealServings", id: "meal-0", servings: 0 },
    { type: "addMeal", id: "overflow", recipe: recipe(), servings: 2 },
    { type: "discussRecipe", recipe: recipe(), servings: 13 },
  ];
  for (const action of invalid) {
    const result = householdReducer({ state, updateError: null }, action);
    assert.equal(result.state, state);
    assert.ok(result.updateError);
  }
});

test("clearing chat removes history, draft, and focus while preserving plan and recipe box", () => {
  const original = createSampleHousehold();
  const actions: HouseholdAction[] = [
    { type: "saveRecipe", recipe: recipe(), source: "demo" },
    { type: "addMeal", id: "dinner", recipe: recipe(), servings: 4 },
    { type: "appendChatMessages", messages: [message("first")] },
    { type: "setChatDraft", text: "Dinner idea" },
    { type: "discussRecipe", recipe: recipe(), servings: 4 },
  ];
  const before = actions.reduce(applyHouseholdAction, original);
  assert.equal(before.workspace.mode, "chat");
  const state = applyHouseholdAction(before, { type: "clearChat" });
  assert.deepEqual(state.workspace.chatMessages, []);
  assert.equal(state.workspace.chatDraft, "");
  assert.equal(state.workspace.focusedRecipe, null);
  assert.equal(state.workspace.focusedServings, null);
  assert.deepEqual(state.workspace.recipeBox, before.workspace.recipeBox);
  assert.deepEqual(state.meals, before.meals);
  assert.deepEqual(state.pantry, before.pantry);
});

test("clearing recipe focus removes its serving context and preserves chat", () => {
  const original = createSampleHousehold();
  const actions: HouseholdAction[] = [
    { type: "appendChatMessages", messages: [message("first")] },
    { type: "setChatDraft", text: "Could I cook this tonight?" },
    { type: "discussRecipe", recipe: recipe(), servings: 6 },
  ];
  const before = actions.reduce(applyHouseholdAction, original);
  const state = applyHouseholdAction(before, { type: "clearRecipeFocus" });
  assert.equal(state.workspace.focusedRecipe, null);
  assert.equal(state.workspace.focusedServings, null);
  assert.equal(state.workspace.mode, "chat");
  assert.equal(state.workspace.chatDraft, before.workspace.chatDraft);
  assert.deepEqual(state.workspace.chatMessages, before.workspace.chatMessages);
});

test("completing a chat turn clears only its submitted draft", () => {
  const submitted = "What can I make tonight?";
  const original = applyHouseholdAction(createSampleHousehold(), {
    type: "setChatDraft",
    text: submitted,
  });
  const completed = applyHouseholdAction(original, {
    type: "completeChatTurn",
    messages: [message("reply")],
    submittedDraft: submitted,
  });
  assert.equal(completed.workspace.chatDraft, "");
  assert.equal(completed.workspace.chatMessages[0].id, "reply");

  const replacement = applyHouseholdAction(original, {
    type: "setChatDraft",
    text: "Review my plan",
  });
  const late = applyHouseholdAction(replacement, {
    type: "completeChatTurn",
    messages: [message("late-reply")],
    submittedDraft: submitted,
  });
  assert.equal(late.workspace.chatDraft, "Review my plan");
  assert.equal(late.workspace.chatMessages[0].id, "late-reply");
});

test("completing a chat turn validates atomically and retains bounded history", () => {
  const original = applyHouseholdAction(createSampleHousehold(), {
    type: "setChatDraft",
    text: "Dinner idea",
  });
  const rejected = householdReducer({ state: original, updateError: null }, {
    type: "completeChatTurn",
    messages: [{ ...message("invalid"), servings: 13 }],
    submittedDraft: "Dinner idea",
  });
  assert.equal(rejected.state, original);
  assert.equal(rejected.state.workspace.chatDraft, "Dinner idea");
  assert.ok(rejected.updateError);

  const completed = applyHouseholdAction(original, {
    type: "completeChatTurn",
    messages: Array.from({ length: 22 }, (_, index) => message(`${index}`)),
    submittedDraft: "Dinner idea",
  });
  assert.equal(completed.workspace.chatMessages.length, 20);
  assert.equal(completed.workspace.chatMessages[0].id, "2");
  assert.equal(completed.workspace.chatDraft, "");
});
