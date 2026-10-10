import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage, Recipe, SuggestMealsRequest, SuggestionBlock } from "@/lib/contracts";
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

function suggestionBlock(input: SuggestMealsRequest, sequence = 1): SuggestionBlock {
  return {
    id: `block-${sequence}`,
    sequence,
    contextKey: JSON.stringify({ pantry: input.pantry, preferences: input.preferences, direction: input.direction ?? "" }),
    direction: input.direction ?? "",
    servings: input.preferences.servings,
    source: "ai",
    recipes: [{ ...recipe(`recipe-${sequence}`), name: `Rice bowl ${sequence}` }],
  };
}

test("recipe feed appends, grows a block in place, and keeps independent snapshots and original portions", () => {
  const original = createSampleHousehold();
  let state = applyHouseholdAction(original, { type: "setSuggestionDirection", direction: "  More rice dishes  " });
  state = applyHouseholdAction(state, { type: "setSuggestionStreamEnabled", enabled: false });
  const input = { pantry: state.pantry, preferences: state.preferences, direction: state.workspace.suggestions.direction };
  const first = suggestionBlock(input);
  state = applyHouseholdAction(state, { type: "appendSuggestionBlock", input, block: first });
  first.recipes[0].ingredients[0].quantity = 999;
  assert.equal(state.workspace.suggestions.blocks[0].recipes[0].ingredients[0].quantity, 150);
  assert.equal(state.workspace.suggestions.direction, "More rice dishes");
  assert.equal(state.workspace.suggestions.streamEnabled, false);
  const grown = { ...state.workspace.suggestions.blocks[0], recipes: [...state.workspace.suggestions.blocks[0].recipes, recipe("second")] };
  state = applyHouseholdAction(state, { type: "appendSuggestionBlock", input, block: grown });
  assert.equal(state.workspace.suggestions.blocks.length, 1);
  assert.equal(state.workspace.suggestions.blocks[0].recipes.length, 2);
  state = applyHouseholdAction(state, { type: "setPreferences", preferences: { ...state.preferences, servings: 4 } });
  state = applyHouseholdAction(state, { type: "setSuggestionDirection", direction: "Now try soup" });
  const nextInput = { pantry: state.pantry, preferences: state.preferences, direction: state.workspace.suggestions.direction };
  state = applyHouseholdAction(state, { type: "appendSuggestionBlock", input: nextInput, block: suggestionBlock(nextInput, 2) });
  assert.deepEqual(state.workspace.suggestions.blocks.map(({ servings, direction }) => ({ servings, direction })), [
    { servings: 2, direction: "More rice dishes" },
    { servings: 4, direction: "Now try soup" },
  ]);
  assert.equal(state.workspace.suggestions.blocks[1].recipes[0].servings, 2);
  assert.deepEqual(state.pantry, original.pantry);
  assert.deepEqual(state.meals, original.meals);
  assert.deepEqual(state.workspace.recipeBox, []);
});

test("recipe feed retains the latest twenty blocks and thirty recent names", () => {
  let state = createSampleHousehold();
  const input = { pantry: state.pantry, preferences: state.preferences };
  for (let sequence = 1; sequence <= 35; sequence++)
    state = applyHouseholdAction(state, { type: "appendSuggestionBlock", input, block: suggestionBlock(input, sequence) });
  assert.equal(state.workspace.suggestions.blocks.length, 20);
  assert.equal(state.workspace.suggestions.blocks[0].sequence, 16);
  assert.equal(state.workspace.suggestions.blocks.at(-1)?.sequence, 35);
  assert.deepEqual(state.workspace.suggestions.recentRecipeNames, Array.from({ length: 30 }, (_, index) => `Rice bowl ${index + 6}`));
  const replacement = { ...state.workspace.suggestions.blocks[0], explanation: "Another detail." };
  state = applyHouseholdAction(state, { type: "appendSuggestionBlock", input, block: replacement });
  assert.equal(state.workspace.suggestions.blocks.length, 20);
  assert.equal(state.workspace.suggestions.blocks[0].explanation, "Another detail.");
});

test("large recipe blocks evict oldest history by serialized size while preserving the latest context and portions", () => {
  let state = createSampleHousehold();
  const longRecipe = { ...recipe(), description: "x".repeat(400), steps: Array(20).fill("x".repeat(1000)) };
  for (let sequence = 1; sequence <= 6; sequence++) {
    state = applyHouseholdAction(state, { type: "setSuggestionDirection", direction: `Direction ${sequence}` });
    state = applyHouseholdAction(state, { type: "setPreferences", preferences: { ...state.preferences, servings: sequence } });
    const input = { pantry: state.pantry, preferences: state.preferences, direction: state.workspace.suggestions.direction };
    const block = { ...suggestionBlock(input, sequence), recipes: Array.from({ length: 6 }, (_, index) => ({ ...longRecipe, id: `recipe-${sequence}-${index}`, name: `Dish ${sequence}-${index}` })) };
    state = applyHouseholdAction(state, { type: "appendSuggestionBlock", input, block });
  }
  const blocks = state.workspace.suggestions.blocks;
  assert.ok(blocks.length < 6);
  assert.ok(JSON.stringify(blocks).length * 2 <= 1_000_000);
  assert.deepEqual(blocks.map(({ sequence }) => sequence), Array.from({ length: blocks.length }, (_, index) => 7 - blocks.length + index));
  assert.deepEqual(blocks.map(({ direction, servings, sequence }) => ({ direction, servings, sequence })), blocks.map(({ sequence }) => ({ direction: `Direction ${sequence}`, servings: sequence, sequence })));
  assert.equal(blocks.at(-1)?.sequence, 6);
  assert.equal(blocks.at(-1)?.recipes[0].servings, 2);
  assert.equal(state.workspace.suggestions.direction, "Direction 6");
  assert.equal(state.preferences.servings, 6);

  // Escaped content can make one schema-valid block exceed the byte budget.
  const input = { pantry: state.pantry, preferences: state.preferences, direction: state.workspace.suggestions.direction };
  const oversized = { ...suggestionBlock(input, 7), recipes: Array.from({ length: 6 }, (_, index) => ({ ...longRecipe, id: `oversized-${index}`, steps: Array(20).fill(String.fromCharCode(1).repeat(1000)) })) };
  state = applyHouseholdAction(state, { type: "appendSuggestionBlock", input, block: oversized });
  assert.equal(state.workspace.suggestions.blocks.length, 1);
  assert.equal(state.workspace.suggestions.blocks[0].id, oversized.id);
  assert.ok(JSON.stringify(state.workspace.suggestions.blocks).length * 2 > 1_000_000);
});

test("stale recipe blocks cannot consume pantry, preference, or direction edits", () => {
  const original = createSampleHousehold();
  const input = { pantry: original.pantry, preferences: original.preferences };
  const block = suggestionBlock(input);
  const changed = [
    applyHouseholdAction(original, { type: "setPantry", pantry: original.pantry.map((item, index) => index === 0 ? { ...item, quantity: item.quantity + 1 } : item) }),
    applyHouseholdAction(original, { type: "setPreferences", preferences: { ...original.preferences, servings: 4 } }),
    applyHouseholdAction(original, { type: "setSuggestionDirection", direction: "Use apples" }),
  ];
  for (const state of changed) {
    assert.deepEqual(applyHouseholdAction(state, { type: "appendSuggestionBlock", input, block }), state);
    assert.deepEqual(applyHouseholdAction(state, { type: "recordSuggestions", input, recipes: [recipe()] }), state);
  }
  for (const invalid of [{ ...block, contextKey: "different kitchen" }, { ...block, servings: 4 }, { ...block, direction: "Different request" }])
    assert.deepEqual(applyHouseholdAction(original, { type: "appendSuggestionBlock", input, block: invalid }), original);
});

test("only a valid current block clears pending additions, and legacy recording preserves feed settings", () => {
  const original = createSampleHousehold();
  let state = applyHouseholdAction(original, { type: "setPantry", pantry: original.pantry.map((item, index) => index === 0 ? { ...item, quantity: item.quantity + 1 } : item) });
  state = applyHouseholdAction(state, { type: "setSuggestionDirection", direction: "Use rice" });
  state = applyHouseholdAction(state, { type: "setSuggestionStreamEnabled", enabled: false });
  const input = { pantry: state.pantry, preferences: state.preferences, direction: state.workspace.suggestions.direction };
  const block = suggestionBlock(input);
  for (const invalid of [
    { ...block, recipes: [] },
    { ...block, recipes: Array.from({ length: 7 }, () => recipe()) },
    { ...block, recipes: [{ ...recipe(), ingredients: [{ ingredientId: "rice", name: "Rice", quantity: -1, unit: "g" as const }] }] },
  ]) {
    const rejected = householdReducer({ state, updateError: null }, { type: "appendSuggestionBlock", input, block: invalid });
    assert.equal(rejected.state, state);
    assert.ok(rejected.updateError);
    assert.equal(rejected.state.workspace.suggestions.pendingIngredients.length, 1);
  }
  state = applyHouseholdAction(state, { type: "appendSuggestionBlock", input, block });
  assert.deepEqual(state.workspace.suggestions.pendingIngredients, []);
  const before = state.workspace.suggestions;
  state = applyHouseholdAction(state, { type: "recordSuggestions", input, recipes: [recipe()] });
  assert.deepEqual(state.workspace.suggestions.blocks, before.blocks);
  assert.equal(state.workspace.suggestions.direction, before.direction);
  assert.equal(state.workspace.suggestions.streamEnabled, before.streamEnabled);
  assert.deepEqual(state.pantry, input.pantry);
  const rejected = householdReducer({ state, updateError: null }, { type: "setSuggestionDirection", direction: "x".repeat(1001) });
  assert.equal(rejected.state, state);
  assert.ok(rejected.updateError);
});

test("stale pilot suggestion responses preserve the input snapshot, revision, and available undo", async () => {
  const { ensurePilot, applyPilotCommand } = await import("@/features/planning/pilot");
  const original = ensurePilot(createSampleHousehold(), "2026-10-08");
  const input = { pantry: original.pantry, preferences: original.preferences };
  const changed = applyHouseholdAction(original, { type: "setSuggestionDirection", direction: "Use apples" });
  const state = applyPilotCommand(changed, {
    id: "change-shopping-window",
    expectedRevision: changed.pilot!.revision,
    operation: { type: "set_shop_through", date: "2026-10-15" },
  }).state;
  assert.ok(state.pilot!.receipts.at(-1)?.inverse);
  const snapshot = structuredClone(state);
  const currentInput = { pantry: state.pantry, preferences: state.preferences, direction: state.workspace.suggestions.direction };
  const ignored: HouseholdAction[] = [
    { type: "appendSuggestionBlock", input, block: suggestionBlock(input) },
    { type: "recordSuggestions", input, recipes: [recipe()] },
    { type: "appendSuggestionBlock", input: currentInput, block: { ...suggestionBlock(currentInput), contextKey: "a different kitchen" } },
  ];
  for (const action of ignored) {
    assert.equal(applyHouseholdAction(state, action), state);
    assert.deepEqual(state, snapshot);
  }
});

test("pilot recipe selection retains an earlier block's portions without rewriting recipe amounts or planning meals", async () => {
  const { ensurePilot } = await import("@/features/planning/pilot");
  const original = createSampleHousehold();
  const input = { pantry: original.pantry, preferences: original.preferences };
  const block = { ...suggestionBlock(input), recipes: [{ ...recipe(), servings: 4 }] };
  let state = applyHouseholdAction(original, { type: "appendSuggestionBlock", input, block });
  state = applyHouseholdAction(state, { type: "setPreferences", preferences: { ...state.preferences, servings: 6 } });
  state = ensurePilot(state, "2026-10-08");
  const actions: HouseholdAction[] = [
    { type: "addMeal", id: "earlier-block", recipe: block.recipes[0], servings: block.servings },
    { type: "discussRecipe", recipe: block.recipes[0], servings: block.servings },
  ];
  for (const action of actions) {
    const selected = applyHouseholdAction(state, action);
    assert.equal(selected.workspace.focusedServings, 2);
    assert.deepEqual(selected.workspace.focusedRecipe, block.recipes[0]);
    assert.deepEqual(selected.pilot!.session.candidates, block.recipes);
    assert.equal(selected.pilot!.session.focusedRecipeId, block.recipes[0].id);
    assert.equal(selected.preferences.servings, 6);
    assert.equal(selected.workspace.focusedRecipe!.servings, 4);
    assert.equal(selected.workspace.focusedRecipe!.ingredients[0].quantity, 150);
    assert.deepEqual(selected.workspace.suggestions.blocks, [block]);
    assert.deepEqual(selected.pantry, state.pantry);
    assert.deepEqual(selected.meals, state.meals);
    assert.deepEqual(selected.pilot!.batches, state.pilot!.batches);
    assert.deepEqual(selected.pilot!.allocations, state.pilot!.allocations);
    assert.equal(state.workspace.focusedRecipe, null);
  }
});

test("valid recipe feed updates keep a reviewed pilot proposal applicable and preserve planning undo", async () => {
  const { ensurePilot, applyPilotCommand } = await import("@/features/planning/pilot");
  const initial = ensurePilot(createSampleHousehold(), "2026-10-08");
  const proposed = applyPilotCommand(initial, {
    id: "propose-shopping-window", expectedRevision: initial.pilot.revision,
    operation: {
      type: "propose", id: "shopping-window", title: "Review the shopping window",
      changes: [{ type: "set_shop_through", date: "2026-10-16" }],
    },
  });
  let state = proposed.state;
  const input = { pantry: state.pantry, preferences: state.preferences, direction: "More rice" };
  const actions: HouseholdAction[] = [
    { type: "setSuggestionDirection", direction: input.direction },
    { type: "setSuggestionStreamEnabled", enabled: false },
    { type: "appendSuggestionBlock", input, block: suggestionBlock(input) },
    { type: "recordSuggestions", input, recipes: [recipe("another-idea")] },
  ];
  for (const action of actions) {
    const previous = state;
    const snapshot = structuredClone(state);
    state = ensurePilot(applyHouseholdAction(state, action));
    assert.deepEqual(previous, snapshot);
    assert.deepEqual(state.pantry, initial.pantry);
    assert.equal(state.pilot.revision, snapshot.pilot!.revision + 1);
    assert.equal(state.pilot.proposals[0].status, "pending");
    assert.equal(state.pilot.proposals[0].baseRevision, state.pilot.revision);
    assert.ok(state.pilot.receipts[0].inverse);
    assert.equal(state.pilot.receipts[0].undoRevision, state.pilot.revision);
    assert.deepEqual(state.pilot.batches, initial.pilot.batches);
    assert.deepEqual(state.pilot.allocations, initial.pilot.allocations);
  }
  const applied = applyPilotCommand(state, {
    id: "apply-shopping-window", expectedRevision: state.pilot.revision,
    operation: { type: "apply_proposal", proposalId: "shopping-window" },
  });
  assert.equal(applied.state.pilot.shopThrough, "2026-10-16");
  assert.equal(applied.state.pilot.proposals[0].status, "applied");
  const undone = applyPilotCommand(state, {
    id: "undo-shopping-window-proposal", expectedRevision: state.pilot.revision,
    operation: { type: "undo", receiptId: proposed.receipt.id },
  });
  assert.deepEqual(undone.state.pilot.proposals, initial.pilot.proposals);
  assert.equal(undone.state.pilot.shopThrough, initial.pilot.shopThrough);
  assert.deepEqual(undone.state.workspace.suggestions, state.workspace.suggestions);
});

test("AI cooldown is shared, can only extend, and leaves kitchen content untouched", () => {
  const original = createSampleHousehold();
  const until = Date.UTC(2026, 8, 30);
  const deferred = applyHouseholdAction(original, { type: "deferAiRequests", until });
  assert.equal(deferred.workspace.aiCooldownUntil, until);
  assert.deepEqual(deferred.pantry, original.pantry);
  assert.deepEqual(deferred.preferences, original.preferences);
  assert.deepEqual(deferred.workspace.chatMessages, original.workspace.chatMessages);
  assert.deepEqual(deferred.workspace.suggestions, original.workspace.suggestions);
  assert.equal(applyHouseholdAction(deferred, { type: "deferAiRequests", until: until - 1000 }).workspace.aiCooldownUntil, until);
  assert.equal(applyHouseholdAction(deferred, { type: "deferAiRequests", until: until + 1000 }).workspace.aiCooldownUntil, until + 1000);
  for (const invalid of [-1, NaN, Infinity, 1.5]) {
    assert.deepEqual(applyHouseholdAction(deferred, { type: "deferAiRequests", until: invalid }), deferred);
  }
});

test("adding an apple prioritizes it until current suggestions complete and remembers dishes for reload", () => {
  const original = createSampleHousehold();
  const apple = { id: "apples", name: "Apple", quantity: 1, unit: "each" as const, location: "Fridge" as const, useSoon: false, tag: "special" as const };
  const updated = applyHouseholdAction(original, { type: "setPantry", pantry: [...original.pantry, apple] });
  assert.deepEqual(updated.workspace.suggestions.pendingIngredients, [{ ingredientId: "apples", name: "Apple", unit: "each" }]);
  const input = { pantry: updated.pantry, preferences: updated.preferences };
  const done = applyHouseholdAction(updated, { type: "recordSuggestions", input, recipes: [recipe()] });
  assert.deepEqual(done.workspace.suggestions, { ...updated.workspace.suggestions, recentRecipeNames: ["Rice bowl"], pendingIngredients: [] });
  assert.deepEqual(done.pantry, updated.pantry);
  assert.deepEqual(done.workspace.recipeBox, []);
  assert.deepEqual(done.meals, []);
  assert.deepEqual(original.workspace.suggestions, { recentRecipeNames: [], pendingIngredients: [], direction: "", streamEnabled: true, blocks: [] });
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

test("measuring the historical amount again explicitly replaces uncertain stock", async () => {
  const { ensurePilot } = await import("@/features/planning/pilot");
  const state = ensurePilot(createSampleHousehold(), "2026-10-08");
  const item = state.pantry[0];
  state.pilot.stock = [{ ingredientId: item.id, name: item.name, unit: item.unit, status: "some" }];
  const preserved = applyHouseholdAction(state, { type: "setPantry", pantry: state.pantry });
  assert.equal(preserved.pilot?.stock[0]?.status, "some");
  const confirmed = applyHouseholdAction(state, { type: "setPantry", pantry: state.pantry, confirmedExactStock: [{ ingredientId: item.id, unit: item.unit }] });
  assert.equal(confirmed.pilot?.stock[0]?.status, "exact");
  assert.equal(confirmed.pilot?.stock[0]?.quantity, item.quantity);
  assert.equal(confirmed.pantry[0].quantity, item.quantity);
  assert.equal(state.pilot.stock[0].status, "some");
});

test("pantry measurements preserve optional stock details and historical purchase lots", async () => {
  const { ensurePilot } = await import("@/features/planning/pilot");
  const state = ensurePilot(createSampleHousehold(), "2026-10-08");
  const item = state.pantry[0];
  const details = { purchasedOn: "2026-10-07", bestBefore: "2026-10-14", sourceNote: "Farm box", useSoon: true };
  state.pilot.stock = [{ ingredientId: item.id, name: item.name, unit: item.unit, status: "some", ...details }];
  state.pilot.purchaseLots.push({ id: "purchase:0", commandId: "purchase", recordedAt: "2026-10-08T12:00:00.000Z", ingredientId: item.id, name: item.name, unit: item.unit, quantity: 100, purchasedOn: details.purchasedOn, bestBefore: details.bestBefore, sourceNote: details.sourceNote, lotCode: "box-A" });
  const changed = applyHouseholdAction(state, { type: "setPantry", pantry: state.pantry.map((entry) => entry === item ? { ...entry, quantity: 123 } : entry), confirmedExactStock: [{ ingredientId: item.id, unit: item.unit }] });
  assert.deepEqual(changed.pilot?.stock[0], { ingredientId: item.id, name: item.name, unit: item.unit, status: "exact", quantity: 123, ...details });
  assert.deepEqual(changed.pilot?.purchaseLots, state.pilot.purchaseLots);
  const removed = applyHouseholdAction(changed, { type: "setPantry", pantry: changed.pantry.filter((entry) => entry.id !== item.id || entry.unit !== item.unit) });
  assert.equal(removed.pilot?.stock.length, 0);
  assert.deepEqual(removed.pilot?.purchaseLots, state.pilot.purchaseLots);
});

test("explicitly discussing a library recipe reconsiders only that rejected candidate", async () => {
  const { ensurePilot } = await import("@/features/planning/pilot");
  const state = ensurePilot(createSampleHousehold(), "2026-10-08");
  const chosen = recipe();
  state.pilot.session.rejectedRecipeIds = [chosen.id, "another-rejected-recipe"];
  const result = applyHouseholdAction(state, { type: "discussRecipe", recipe: chosen, servings: 2 });
  assert.deepEqual(result.pilot?.session.rejectedRecipeIds, ["another-rejected-recipe"]);
  assert.equal(result.pilot?.session.focusedRecipeId, chosen.id);
  assert.deepEqual(result.pilot?.allocations, state.pilot.allocations);
  assert.deepEqual(state.pilot.session.rejectedRecipeIds, [chosen.id, "another-rejected-recipe"]);
});

test("legacy quantity edits preserve uncertainty until one measured total is explicitly confirmed", async () => {
  const { ensurePilot } = await import("@/features/planning/pilot");
  const state = ensurePilot(createSampleHousehold(), "2026-10-08");
  const item = state.pantry[0];
  state.pilot.stock = [{ ingredientId: item.id, name: item.name, unit: item.unit, status: "some" }];
  const pantry = [...state.pantry, { ...item, quantity: 100 }];
  const changed = applyHouseholdAction(state, { type: "setPantry", pantry });
  assert.equal(changed.pilot?.stock[0].status, "some");
  assert.throws(() => applyHouseholdAction(state, { type: "setPantry", pantry, confirmedExactStock: [{ ingredientId: item.id, unit: item.unit }] }), /one measured total/);
  assert.equal(state.pilot.stock[0].status, "some");
});
