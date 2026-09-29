import assert from "node:assert/strict";
import test from "node:test";
import { MealRequestError, mealFailureMessage } from "./client-request";
import { withMealRateLimitRecovery } from "./meal-retry";

test("one busy reply waits for its deadline then succeeds with one retry", async () => {
  let now = 1000;
  let cooldownUntil = 0;
  let calls = 0;
  const waits: number[] = [];
  const result = await withMealRateLimitRecovery(async () => {
    calls += 1;
    if (calls === 1) throw new MealRequestError("Busy", 429, 61_000);
    return "fresh recipes";
  }, {
    signal: new AbortController().signal,
    now: () => now,
    getCooldownUntil: () => cooldownUntil,
    deferRequests: (until) => { cooldownUntil = until; },
    wait: async (delay) => { waits.push(delay); now += delay; },
  });
  assert.equal(result, "fresh recipes");
  assert.equal(calls, 2);
  assert.deepEqual(waits, [60_000]);
});

test("a second busy reply stops, retains the cooldown, and requires explicit retry", async () => {
  let now = 0;
  let cooldownUntil = 0;
  let calls = 0;
  await assert.rejects(withMealRateLimitRecovery(async () => {
    calls += 1;
    throw new MealRequestError("AI is busy.", 429, now + 30_000);
  }, {
    signal: new AbortController().signal,
    now: () => now,
    getCooldownUntil: () => cooldownUntil,
    deferRequests: (until) => { cooldownUntil = until; },
    wait: async (delay) => { now += delay; },
  }), (error: unknown) => {
    assert.ok(error instanceof MealRequestError);
    assert.equal(error.automaticRetryExhausted, true);
    assert.match(mealFailureMessage(error), /automatic retry stopped/);
    return true;
  });
  assert.equal(calls, 2);
  assert.equal(cooldownUntil, 60_000);
});

test("persisted cooldown blocks the first call and rechecks extensions before sending latest work", async () => {
  let now = 0;
  let cooldownUntil = 30_000;
  let input = "old kitchen";
  const waits: number[] = [];
  const result = await withMealRateLimitRecovery(async () => input, {
    signal: new AbortController().signal,
    now: () => now,
    getCooldownUntil: () => cooldownUntil,
    deferRequests: () => assert.fail("No busy response occurred"),
    wait: async (delay) => {
      waits.push(delay);
      now += delay;
      if (waits.length === 1) {
        cooldownUntil = 60_000;
        input = "latest kitchen";
      }
    },
  });
  assert.equal(result, "latest kitchen");
  assert.deepEqual(waits, [30_000, 30_000]);
});

test("cancelling a queued automatic retry prevents the second request", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(withMealRateLimitRecovery(async () => {
    calls += 1;
    throw new MealRequestError("Busy", 429, 30_000);
  }, {
    signal: controller.signal,
    now: () => 0,
    getCooldownUntil: () => 0,
    deferRequests: () => undefined,
    wait: async (_delay, signal) => {
      controller.abort(new DOMException("Stopped", "AbortError"));
      signal.throwIfAborted();
    },
  }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("other errors are not retried or given a cooldown", async () => {
  let calls = 0;
  await assert.rejects(withMealRateLimitRecovery(async () => {
    calls += 1;
    throw new MealRequestError("Unavailable", 503);
  }, {
    signal: new AbortController().signal,
    getCooldownUntil: () => 0,
    deferRequests: () => assert.fail("Non-rate errors must not create cooldowns"),
  }), { message: "Unavailable" });
  assert.equal(calls, 1);
});
