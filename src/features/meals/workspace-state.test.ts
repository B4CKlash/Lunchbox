import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage, Recipe } from "@/lib/contracts";
import { createSampleHousehold } from "@/features/pantry/seed";
import { buildShoppingList } from "@/features/planning/shopping";
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
    ingredients: [{ ingredientId: "rice", name: "Rice", quantity, unit: "g" }],
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

test("adding an apple prioritizes it until current suggestions complete and remembers dishes for reload", () => {
  const original = createSampleHousehold();
  const apple = { id: "apples", name: "Apple", quantity: 1, unit: "each" as const, location: "Fridge" as const, useSoon: false, tag: "special" as const };
  const updated = applyHouseholdAction(original, { type: "setPantry", pantry: [...original.pantry, apple] });
  assert.deepEqual(updated.workspace.suggestions.pendingIngredients, [{ ingredientId: "apples", name: "Apple", unit: "each" }]);
  const input = { pantry: updated.pantry, preferences: updated.preferences };
  const done = applyHouseholdAction(updated, { type: "recordSuggestions", input, recipes: [recipe()] });
  assert.deepEqual(done.workspace.suggestions, { recentRecipeNames: ["Rice bowl"], pendingIngredients: [] });
  assert.deepEqual(done.pantry, updated.pantry);
  assert.deepEqual(done.workspace.recipeBox, []);
  assert.deepEqual(done.meals, []);
  assert.deepEqual(original.workspace.suggestions, { recentRecipeNames: [], pendingIngredients: [] });
});

test("empty or stale suggestion responses cannot consume a newer pantry or preference edit", () => {
  const original = createSampleHousehold();
  const input = { pantry: original.pantry, preferences: original.preferences };
  const restocked = applyHouseholdAction(original, { type: "setPantry", pantry: original.pantry.map((item, index) => index === 0 ? { ...item, quantity: item.quantity + 1 } : item) });
  assert.deepEqual(applyHouseholdAction(restocked, { type: "recordSuggestions", input, recipes: [recipe()] }), restocked);
  const nextInput = { pantry: restocked.pantry, preferences: restocked.preferences };
  assert.deepEqual(applyHouseholdAction(restocked, { type: "recordSuggestions", input: nextInput, recipes: [] }), restocked);
  const changedPreferences = applyHouseholdAction(restocked, { type: "setPreferences", preferences: { ...restocked.preferences, servings: 4 } });
  assert.deepEqual(applyHouseholdAction(changedPreferences, { type: "recordSuggestions", input: nextInput, recipes: [recipe()] }), changedPreferences);
});

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
  assert.equal(state.workspace.calendar.draft?.length, 1);
  assert.deepEqual(state.meals, []);
  assert.equal(state.workspace.calendar.draft![0].servings, 4);
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
  assert.equal(
    state.workspace.calendar.draft![0].recipe.ingredients[0].quantity,
    150,
  );
  assert.equal(state.workspace.recipeBox[0].recipe.steps[0], "Cook the rice.");

  const previous = state;
  state = applyHouseholdAction(state, {
    type: "saveRecipe",
    recipe: recipe("rice-meal", 200),
    source: "ai",
  });
  assert.equal(state.workspace.recipeBox.length, 1);
  assert.equal(state.workspace.recipeBox[0].source, "ai");
  assert.equal(
    state.workspace.recipeBox[0].recipe.ingredients[0].quantity,
    200,
  );
  assert.equal(
    state.workspace.calendar.draft![0].recipe.ingredients[0].quantity,
    150,
  );
  assert.equal(
    previous.workspace.recipeBox[0].recipe.ingredients[0].quantity,
    150,
  );

  state.workspace.recipeBox[0].recipe.ingredients[0].quantity = 300;
  assert.equal(
    state.workspace.calendar.draft![0].recipe.ingredients[0].quantity,
    150,
  );
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
  assert.equal(state.workspace.calendar.draft![0].servings, 12);
  assert.deepEqual(state.pantry, original.pantry);
  const removed = applyHouseholdAction(state, {
    type: "removeMeal",
    id: "dinner",
  });
  assert.deepEqual(removed.workspace.calendar.draft, []);
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
  const incoming = Array.from({ length: 22 }, (_, index) =>
    message(`${index}`),
  );
  let state = applyHouseholdAction(createSampleHousehold(), {
    type: "appendChatMessages",
    messages: incoming,
  });
  assert.deepEqual(
    state.workspace.chatMessages.map((entry) => entry.id),
    Array.from({ length: 20 }, (_, index) => `${index + 2}`),
  );
  incoming[21].recipes[0].ingredients[0].quantity = 999;
  assert.equal(
    state.workspace.chatMessages[19].recipes[0].ingredients[0].quantity,
    150,
  );
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
    {
      type: "appendChatMessages",
      messages: [{ ...message("bad"), text: "x".repeat(2001) }],
    },
    {
      type: "appendChatMessages",
      messages: [{ ...message("bad"), servings: 13 }],
    },
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
  assert.deepEqual(state.workspace.calendar, before.workspace.calendar);
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
  const rejected = householdReducer(
    { state: original, updateError: null },
    {
      type: "completeChatTurn",
      messages: [{ ...message("invalid"), servings: 13 }],
      submittedDraft: "Dinner idea",
    },
  );
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

test("calendar experimentation leaves shopping unchanged until an idempotent commit", () => {
  const original = createSampleHousehold();
  original.pantry = [];
  const meal = {
    id: "lunch",
    recipe: recipe(),
    servings: 4,
    date: "2026-10-05",
    slot: "lunch" as const,
  };
  let state = applyHouseholdAction(original, {
    type: "setCalendarDraft",
    meals: [meal],
  });
  assert.deepEqual(state.meals, []);
  assert.deepEqual(buildShoppingList(state.pantry, state.meals), []);
  meal.recipe.ingredients[0].quantity = 999;
  assert.equal(
    state.workspace.calendar.draft![0].recipe.ingredients[0].quantity,
    150,
  );
  state = applyHouseholdAction(state, { type: "commitCalendar" });
  assert.equal(state.workspace.calendar.draft, null);
  assert.equal(buildShoppingList(state.pantry, state.meals)[0].quantity, 300);
  assert.deepEqual(state.pantry, original.pantry);
  assert.deepEqual(
    applyHouseholdAction(state, { type: "commitCalendar" }),
    state,
  );

  const committed = state;
  state = applyHouseholdAction(state, {
    type: "setMealServings",
    id: "lunch",
    servings: 2,
  });
  assert.equal(state.meals[0].servings, 4);
  assert.equal(state.workspace.calendar.draft![0].servings, 2);
  assert.equal(buildShoppingList(state.pantry, state.meals)[0].quantity, 300);
  state = applyHouseholdAction(state, { type: "discardCalendarDraft" });
  assert.deepEqual(state, committed);
  state = applyHouseholdAction(state, { type: "removeMeal", id: "lunch" });
  assert.equal(state.meals.length, 1);
  assert.deepEqual(state.workspace.calendar.draft, []);
  state = applyHouseholdAction(state, { type: "commitCalendar" });
  assert.deepEqual(state.meals, []);
  assert.deepEqual(buildShoppingList(state.pantry, state.meals), []);
});

test("calendar settings and draft snapshots stay independent of committed meals", () => {
  const original = createSampleHousehold();
  const state = applyHouseholdAction(original, {
    type: "setCalendarSettings",
    patch: {
      startDate: "2026-10-05",
      days: 10,
      slots: ["lunch", "snack"],
      targetMeals: 12,
    },
  });
  assert.deepEqual(state.workspace.calendar, {
    startDate: "2026-10-05",
    days: 10,
    slots: ["lunch", "snack"],
    targetMeals: 12,
    draft: null,
  });
  assert.deepEqual(state.meals, original.meals);
  assert.deepEqual(state.pantry, original.pantry);
  assert.equal(original.workspace.calendar.startDate, null);
});

test("first calendar edit pins its local week and later edits retain that range", () => {
  const original = createSampleHousehold();
  const state = applyHouseholdAction(original, {
    type: "addMeal",
    id: "inbox",
    recipe: recipe(),
    servings: 2,
    calendarStartDate: "2026-10-05",
  });
  assert.equal(state.workspace.calendar.startDate, "2026-10-05");
  const later = applyHouseholdAction(state, {
    type: "setCalendarDraft",
    meals: [
      {
        ...state.workspace.calendar.draft![0],
        date: "2026-10-05",
        slot: "lunch",
      },
    ],
    calendarStartDate: "2026-10-12",
  });
  assert.equal(later.workspace.calendar.startDate, "2026-10-05");
  assert.equal(later.workspace.calendar.draft![0].date, "2026-10-05");
  assert.equal(original.workspace.calendar.startDate, null);
  const placedFirst = applyHouseholdAction(original, {
    type: "setCalendarDraft",
    meals: later.workspace.calendar.draft!,
    calendarStartDate: "2026-10-05",
  });
  assert.equal(placedFirst.workspace.calendar.startDate, "2026-10-05");
});

test("calendar validation rejects invalid dates, duplicate slots and IDs, and unscheduled commits atomically", () => {
  const original = createSampleHousehold();
  const meal = {
    id: "lunch",
    recipe: recipe(),
    servings: 2,
    date: "2026-10-05",
    slot: "lunch" as const,
  };
  const invalid: HouseholdAction[] = [
    { type: "setCalendarDraft", meals: [meal, { ...meal, id: "another" }] },
    {
      type: "setCalendarDraft",
      meals: [meal, { ...meal, date: "2026-10-06" }],
    },
    { type: "setCalendarDraft", meals: [{ ...meal, date: "2026-02-30" }] },
    { type: "setCalendarDraft", meals: [{ ...meal, slot: undefined }] },
    { type: "setCalendarSettings", patch: { slots: ["lunch", "lunch"] } },
    { type: "setCalendarSettings", patch: { slots: [] } },
    { type: "setCalendarSettings", patch: { targetMeals: 51 } },
    { type: "setCalendarSettings", patch: { days: 29 } },
  ];
  for (const action of invalid) {
    const rejected = householdReducer(
      { state: original, updateError: null },
      action,
    );
    assert.equal(rejected.state, original);
    assert.ok(rejected.updateError);
  }
  const inbox = applyHouseholdAction(original, {
    type: "addMeal",
    id: "inbox",
    recipe: recipe(),
    servings: 2,
  });
  const rejected = householdReducer(
    { state: inbox, updateError: null },
    { type: "commitCalendar" },
  );
  assert.equal(rejected.state, inbox);
  assert.match(rejected.updateError ?? "", /Place every recipe/);
});
