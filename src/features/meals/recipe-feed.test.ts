import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "@/features/pantry/seed";
import type { Recipe, SuggestionBlock, SuggestMealsRequest, SuggestMealsResponse } from "@/lib/contracts";
import { MealRequestError } from "./client-request";
import { withMealRateLimitRecovery } from "./meal-retry";
import { generateRecipeBlock, waitForRecipeBlock } from "./recipe-feed";

const recipe = (name: string): Recipe => ({
  id: name, name, description: "A pantry meal.", servings: 2, minutes: 20,
  ingredients: [{ ingredientId: "rice", name: "Jasmine rice", quantity: 100, unit: "g" }],
  steps: ["Cook the rice and serve."],
});
const input = (): SuggestMealsRequest => {
  const state = createSampleHousehold();
  return {
    pantry: state.pantry, preferences: { ...state.preferences, servings: 4 }, direction: "More soups",
    recentRecipeNames: ["Yesterday's soup"],
    preferredIngredients: [{ ingredientId: "apples", name: "Apple", unit: "each" }],
  };
};
const seed = { id: "block-1", sequence: 1, contextKey: "kitchen-1", direction: "More soups", servings: 4 };
const reply = (...names: string[]): SuggestMealsResponse => ({ source: "ai", recipes: names.map(recipe) });

test("a six-recipe block saves each sequential half and carries its names into the second request", async () => {
  const events: string[] = [];
  const sent: SuggestMealsRequest[] = [];
  const saved: SuggestionBlock[] = [];
  const result = await generateRecipeBlock({
    seed, aiMode: "ai", signal: new AbortController().signal,
    getInput: input, getExistingNames: () => [],
    send: async (request) => {
      events.push(`send-${sent.length + 1}`);
      sent.push(request);
      return sent.length === 1 ? reply("Soup A", "Soup B", "Soup C") : reply("Soup D", "Soup E", "Soup F");
    },
    onBatch: (_input, block) => { saved.push(block); events.push(`save-${block.recipes.length}`); },
  });
  assert.deepEqual(events, ["send-1", "save-3", "send-2", "save-6"]);
  assert.equal(result.outcome, "complete");
  assert.deepEqual(sent[1].recentRecipeNames, ["Yesterday's soup", "Soup A", "Soup B", "Soup C"]);
  assert.equal(sent[0].preferredIngredients?.length, 1);
  assert.deepEqual(sent[1].preferredIngredients, []);
  assert.equal(saved[0].recipes.length, 3);
  assert.equal(saved[1].id, saved[0].id);
  assert.equal(saved[1].servings, 4);
  assert.equal(saved[1].recipes[0].servings, 2);
});

test("duplicates anywhere in the retained feed or block do not become new cards or an automatic refill loop", async () => {
  let calls = 0;
  const saved: SuggestionBlock[] = [];
  const result = await generateRecipeBlock({
    seed, aiMode: "ai", signal: new AbortController().signal,
    getInput: input, getExistingNames: () => ["Old soup"],
    send: async () => ++calls === 1 ? reply(" old   SOUP ", "New soup", "New soup") : reply("NEW SOUP"),
    onBatch: (_input, block) => saved.push(block),
  });
  assert.equal(calls, 2);
  assert.equal(result.outcome, "duplicates");
  assert.deepEqual(saved[0].recipes.map((item) => item.name), ["New soup"]);
  assert.equal(saved.length, 1);
});

test("pausing after a saved half prevents its second request and keeps the original block snapshot", async () => {
  const controller = new AbortController();
  const saved: SuggestionBlock[] = [];
  let calls = 0;
  await assert.rejects(generateRecipeBlock({
    seed, aiMode: "ai", signal: controller.signal,
    getInput: input, getExistingNames: () => [],
    send: async () => { calls++; return reply("Soup A", "Soup B", "Soup C"); },
    onBatch: (_input, block) => { saved.push(block); controller.abort(); },
  }), { name: "AbortError" });
  assert.equal(calls, 1);
  assert.equal(saved[0].recipes.length, 3);
  assert.equal(saved[0].direction, "More soups");
});

test("an obsolete response arriving after cancellation cannot save recipes or launch more work", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(generateRecipeBlock({
    seed, aiMode: "ai", signal: controller.signal,
    getInput: input, getExistingNames: () => [],
    send: async () => { calls++; controller.abort(); return reply("Late soup"); },
    onBatch: () => assert.fail("A cancelled response must not be recorded"),
  }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("a second-half error or empty clarification preserves earlier recipes without requesting a replacement", async () => {
  for (const fails of [true, false]) {
    let calls = 0;
    const saved: SuggestionBlock[] = [];
    const run = generateRecipeBlock({
      seed, aiMode: "ai", signal: new AbortController().signal,
      getInput: input, getExistingNames: () => [],
      send: async () => {
        if (++calls === 1) return reply("Soup A", "Soup B", "Soup C");
        if (fails) throw new Error("Unavailable");
        return { source: "ai", recipes: [], explanation: "Please clarify the next direction." };
      },
      onBatch: (_input, block) => saved.push(block),
    });
    if (fails) await assert.rejects(run, { message: "Unavailable" });
    else {
      const result = await run;
      assert.equal(result.outcome, "empty");
      assert.equal(result.explanation, "Please clarify the next direction.");
    }
    assert.equal(calls, 2);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].recipes.length, 3);
  }
});

test("a block stops after the bounded busy retry rather than starting its second half", async () => {
  let calls = 0;
  let now = 0;
  let cooldown = 0;
  const controller = new AbortController();
  await assert.rejects(generateRecipeBlock({
    seed, aiMode: "ai", signal: controller.signal,
    getInput: input, getExistingNames: () => [],
    send: () => withMealRateLimitRecovery(async () => {
      calls++;
      throw new MealRequestError("Busy", 429, now + 30_000);
    }, {
      signal: controller.signal, now: () => now, getCooldownUntil: () => cooldown,
      deferRequests: (until) => { cooldown = until; }, wait: async (delay) => { now += delay; },
    }),
    onBatch: () => assert.fail("Busy requests have no recipes"),
  }), (error: unknown) => error instanceof MealRequestError && error.automaticRetryExhausted);
  assert.equal(calls, 2);
  assert.equal(cooldown, 60_000);
});

test("demo generation finishes after a single sample response", async () => {
  let calls = 0;
  const result = await generateRecipeBlock({
    seed, aiMode: "demo", signal: new AbortController().signal,
    getInput: input, getExistingNames: () => [],
    send: async () => { calls++; return { source: "demo", recipes: [recipe("Sample rice")] }; },
    onBatch: () => undefined,
  });
  assert.equal(calls, 1);
  assert.equal(result.outcome, "demo");
});

test("pausing cancels the scheduled continuation immediately", async () => {
  const controller = new AbortController();
  const waiting = waitForRecipeBlock(15_000, controller.signal);
  controller.abort();
  await assert.rejects(waiting, { name: "AbortError" });
});
