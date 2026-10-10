import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema } from "@/lib/contracts";
import { createSampleHousehold } from "./seed";
import { HOUSEHOLD_STORAGE_KEY, loadHousehold, saveHousehold } from "./storage";

test("sample households satisfy the contract and do not share mutable data", () => {
  const first = createSampleHousehold();
  const second = createSampleHousehold();
  assert.equal(householdStateSchema.safeParse(first).success, true);
  assert.equal(first.pantry.length, 10);
  assert.deepEqual(first.meals, []);
  assert.equal(first.workspace.mode, "suggestions");
  first.pantry[0].quantity = 0;
  assert.equal(second.pantry[0].quantity, 800);
  first.workspace.chatDraft = "Dinner idea";
  assert.equal(second.workspace.chatDraft, "");
});

test("a saved household round-trips with edits and preferences intact", () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
  };
  const state = createSampleHousehold();
  state.pantry[0].quantity = 650;
  state.preferences.servings = 4;
  state.workspace.mode = "chat";
  state.workspace.chatDraft = "Use my tomatoes";
  state.workspace.chatMessages = [
    {
      id: "question",
      role: "user",
      text: "What can I cook?",
      recipes: [],
      servings: 4,
    },
  ];
  saveHousehold(storage, state);
  assert.ok(saved.has(HOUSEHOLD_STORAGE_KEY));
  assert.deepEqual(loadHousehold(storage), state);
});

test("legacy v1 saves gain a blank workspace without losing pantry, preferences, or planned snapshots", () => {
  const current = createSampleHousehold();
  const legacy = {
    version: 1,
    pantry: [{ ...current.pantry[0], quantity: 321 }],
    preferences: { servings: 4, maxMinutes: 45, prioritizeUseSoon: false },
    meals: [
      {
        id: "previous-dinner",
        servings: 4,
        recipe: {
          id: "previous-recipe",
          name: "Tomato rice",
          description: "A saved recipe snapshot",
          servings: 2,
          minutes: 20,
          ingredients: [
            { ingredientId: "rice", name: "Rice", quantity: 150, unit: "g" },
          ],
          steps: ["Cook rice."],
        },
      },
    ],
  };
  const loaded = loadHousehold({ getItem: () => JSON.stringify(legacy) });
  assert.ok(loaded);
  assert.equal(loaded.version, 1);
  assert.deepEqual(loaded.pantry, legacy.pantry);
  assert.deepEqual(loaded.preferences, legacy.preferences);
  assert.deepEqual(loaded.meals, legacy.meals);
  assert.deepEqual(loaded.workspace, {
    mode: "suggestions",
    aiCooldownUntil: 0,
    recipeBox: [],
    chatMessages: [],
    chatDraft: "",
    focusedRecipe: null,
    focusedServings: null,
    suggestions: { recentRecipeNames: [], pendingIngredients: [], direction: "", streamEnabled: true, blocks: [] },
    calendar: {
      startDate: null,
      days: 7,
      slots: ["breakfast", "lunch", "dinner"],
      targetMeals: 7,
      draft: null,
    },
  });
  assert.equal(HOUSEHOLD_STORAGE_KEY, "lunchbox.household.v1");
});

test("recipe variety and pending pantry additions survive reload without changing the household key", () => {
  const state = createSampleHousehold();
  state.workspace.suggestions = {
    ...state.workspace.suggestions,
    recentRecipeNames: ["Apple and lentil salad", "Pepper rice"],
    pendingIngredients: [{ ingredientId: "apples", name: "Apple", unit: "each" }],
  };
  let stored = "";
  saveHousehold({ setItem: (key, value) => {
    assert.equal(key, HOUSEHOLD_STORAGE_KEY);
    stored = value;
  } }, state);
  assert.deepEqual(loadHousehold({ getItem: () => stored }), state);
  const legacy = { ...state, workspace: { ...state.workspace, suggestions: undefined } };
  const upgraded = loadHousehold({ getItem: () => JSON.stringify(legacy) });
  assert.ok(upgraded);
  assert.deepEqual(upgraded.workspace.suggestions, { recentRecipeNames: [], pendingIngredients: [], direction: "", streamEnabled: true, blocks: [] });
  assert.deepEqual(upgraded.pantry, state.pantry);
  assert.deepEqual(upgraded.workspace.recipeBox, state.workspace.recipeBox);
});

test("recipe feed direction, pause state, blocks, and original servings survive reload in the existing household save", () => {
  const state = createSampleHousehold();
  const originalPreferences = { ...state.preferences, servings: 2 };
  state.preferences.servings = 4;
  state.workspace.suggestions.direction = "Something warming";
  state.workspace.suggestions.streamEnabled = false;
  state.workspace.suggestions.blocks = [{
    id: "feed-1",
    sequence: 1,
    contextKey: JSON.stringify({ pantry: state.pantry, preferences: originalPreferences, direction: "Use rice" }),
    direction: "Use rice",
    servings: 2,
    source: "ai",
    recipes: [{
      id: "rice-soup", name: "Rice soup", description: "A warming soup.", servings: 2, minutes: 20,
      ingredients: [{ ingredientId: "rice", name: "Jasmine rice", quantity: 100, unit: "g" }],
      steps: ["Simmer the rice."],
    }],
    explanation: "An earlier idea.",
  }];
  let stored = "";
  saveHousehold({ setItem: (key, value) => { assert.equal(key, HOUSEHOLD_STORAGE_KEY); stored = value; } }, state);
  assert.deepEqual(loadHousehold({ getItem: () => stored }), state);

  const olderMemory = { recentRecipeNames: ["Rice soup"], pendingIngredients: [{ ingredientId: "rice", name: "Jasmine rice", unit: "g" }] };
  const legacy = { ...state, workspace: { ...state.workspace, suggestions: olderMemory } };
  const upgraded = loadHousehold({ getItem: () => JSON.stringify(legacy) });
  assert.ok(upgraded);
  assert.deepEqual(upgraded.workspace.suggestions, { ...olderMemory, direction: "", streamEnabled: true, blocks: [] });
  assert.deepEqual(upgraded.pantry, state.pantry);
  assert.deepEqual(upgraded.preferences, state.preferences);
  assert.deepEqual(upgraded.meals, state.meals);
});

test("AI cooldown survives reload and older saves start without a cooldown", () => {
  const state = createSampleHousehold();
  state.workspace.aiCooldownUntil = Date.UTC(2026, 8, 30);
  let stored = "";
  saveHousehold({ setItem: (key, value) => {
    assert.equal(key, HOUSEHOLD_STORAGE_KEY);
    stored = value;
  } }, state);
  assert.equal(loadHousehold({ getItem: () => stored })?.workspace.aiCooldownUntil, state.workspace.aiCooldownUntil);
  const legacy = { ...state, workspace: { ...state.workspace, aiCooldownUntil: undefined } };
  const loaded = loadHousehold({ getItem: () => JSON.stringify(legacy) });
  assert.equal(loaded?.workspace.aiCooldownUntil, 0);
  assert.deepEqual(loaded?.pantry, state.pantry);
});

test("missing, corrupt, incompatible, and invalid saves fall back safely", () => {
  const state = createSampleHousehold();
  for (const stored of [
    null,
    "{broken",
    "null",
    JSON.stringify({ ...state, version: 2 }),
    JSON.stringify({
      ...state,
      pantry: [{ ...state.pantry[0], quantity: -1 }],
    }),
  ]) {
    assert.equal(loadHousehold({ getItem: () => stored }), null);
  }
  assert.equal(
    loadHousehold({
      getItem: () => {
        throw new Error("Storage disabled");
      },
    }),
    null,
  );
});

test("existing recipe workspaces gain calendar defaults and calendar drafts survive reload independently", () => {
  const original = createSampleHousehold();
  original.workspace.chatDraft = "Next week's lunches";
  const oldWorkspace: Partial<typeof original.workspace> = {
    ...original.workspace,
  };
  delete oldWorkspace.calendar;
  const loaded = loadHousehold({
    getItem: () => JSON.stringify({ ...original, workspace: oldWorkspace }),
  });
  assert.ok(loaded);
  assert.equal(loaded.workspace.chatDraft, original.workspace.chatDraft);
  assert.deepEqual(loaded.workspace.calendar, original.workspace.calendar);
  loaded.workspace.calendar.startDate = "2026-10-05";
  loaded.workspace.calendar.draft = [
    {
      id: "draft-lunch",
      servings: 4,
      date: "2026-10-05",
      slot: "lunch",
      recipe: {
        id: "rice",
        name: "Rice",
        description: "A rice bowl",
        servings: 2,
        minutes: 20,
        ingredients: [
          { ingredientId: "rice", name: "Rice", quantity: 150, unit: "g" },
        ],
        steps: ["Cook rice."],
      },
    },
  ];
  let saved = "";
  saveHousehold(
    {
      setItem: (_key, value) => {
        saved = value;
      },
    },
    loaded,
  );
  const roundTripped = loadHousehold({ getItem: () => saved });
  assert.deepEqual(roundTripped, loaded);
  assert.deepEqual(roundTripped?.meals, []);
});

test("storage write failures reach the caller instead of claiming a successful save", () => {
  assert.throws(
    () =>
      saveHousehold(
        {
          setItem: () => {
            throw new Error("Quota exceeded");
          },
        },
        createSampleHousehold(),
      ),
    /Quota exceeded/,
  );
});

test("recovery preserves original bytes and stops if the copy cannot be written", async () => {
  const { preserveHouseholdRecovery, HOUSEHOLD_RECOVERY_KEY } = await import("./storage");
  const saved = new Map([[HOUSEHOLD_STORAGE_KEY, "{original-corrupt-data"]]);
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  preserveHouseholdRecovery(storage, "Before migration", "2026-10-08T00:00:00.000Z");
  preserveHouseholdRecovery(storage, "Repeated migration", "2026-10-08T00:00:01.000Z");
  const copies = JSON.parse(saved.get(HOUSEHOLD_RECOVERY_KEY)!);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].raw, "{original-corrupt-data");
  assert.equal(saved.get(HOUSEHOLD_STORAGE_KEY), "{original-corrupt-data");
  saved.set(HOUSEHOLD_STORAGE_KEY, "another original");
  assert.throws(() => preserveHouseholdRecovery({ ...storage, setItem: () => { throw new Error("Quota exceeded"); } }, "Switch account"), /Quota exceeded/);
  assert.equal(saved.get(HOUSEHOLD_STORAGE_KEY), "another original");
});

test("the one active storage key retains cache ownership and retry metadata", async () => {
  const { readHouseholdCache } = await import("./storage");
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const household = createSampleHousehold();
  const cache = { ownerId: "owner-a", householdId: "shared-a", pending: { id: "purchase-retry" } };
  saveHousehold(storage, household, cache);
  assert.equal(values.size, 1);
  assert.deepEqual(loadHousehold(storage), household);
  assert.deepEqual(readHouseholdCache(storage), cache);
});
