import assert from "node:assert/strict";
import test from "node:test";
import { createGateway } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createSampleHousehold } from "@/features/pantry/seed";
import { chatAboutMeals, suggestMeals } from "./providers";
import { AiRuntimeError, generateStructured, getAiMode, getAiModel } from "./ai-runtime";
import { z } from "zod";

test("demo mode never calls an injected model; explicit AI failures never return demo", async () => {
  const previous = process.env.LUNCHBOX_AI_MODE;
  try {
    const state = createSampleHousehold();
    const input = { ...state, recipeBox: [], messages: [], message: "What can I make tonight?" };
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw Object.assign(new Error("private provider details"), { statusCode: 429 }); } });
    process.env.LUNCHBOX_AI_MODE = "demo";
    assert.equal((await suggestMeals(state, { model })).source, "demo");
    assert.equal((await chatAboutMeals(input, { model })).source, "demo");
    assert.equal(model.doGenerateCalls.length, 0);
    process.env.LUNCHBOX_AI_MODE = "ai";
    await assert.rejects(chatAboutMeals(input, { model }), (error: unknown) => error instanceof AiRuntimeError && error.code === "rate_limit");
    assert.equal(model.doGenerateCalls.length, 1);
  } finally {
    if (previous === undefined) delete process.env.LUNCHBOX_AI_MODE;
    else process.env.LUNCHBOX_AI_MODE = previous;
  }
});

test("configuration defaults are explicit", () => {
  const names = ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "LUNCHBOX_AI_MODE", "LUNCHBOX_AI_MODEL"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.equal(getAiMode(), "demo");
    assert.equal(getAiModel(), "google/gemini-2.5-flash");
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test("runtime accepts request-context OIDC and categorizes development and production Gateway failures", async (t) => {
  const names = ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "NODE_ENV"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const contextSymbol = Symbol.for("@vercel/request-context");
  const globals = globalThis as typeof globalThis & { [key: symbol]: unknown };
  const previousContext = globals[contextSymbol];
  const previousProvider = globalThis.AI_SDK_DEFAULT_PROVIDER;
  const token = `test.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  let calls = 0;
  let failure: { status: number; type: string } | undefined;
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network request in offline authentication test"); });
  try {
    for (const name of names) Reflect.deleteProperty(process.env, name);
    Object.assign(process.env, { NODE_ENV: "test" });
    globals[contextSymbol] = { get: () => ({ headers: { "x-vercel-oidc-token": token } }) };
    globalThis.AI_SDK_DEFAULT_PROVIDER = createGateway({
      fetch: async (_url, init) => {
        calls += 1;
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("authorization"), `Bearer ${token}`);
        assert.equal(headers.get("ai-gateway-auth-method"), "oidc");
        if (failure) return Response.json({ error: { message: "Private provider details", type: failure.type } }, { status: failure.status });
        return Response.json({
          content: [{ type: "text", text: '{"ok":true}' }],
          finishReason: { unified: "stop" },
          usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
          warnings: [],
        });
      },
    });
    const options = { schema: z.object({ ok: z.boolean() }), prompt: "Test", instructions: "Test", operation: "chat" };
    assert.deepEqual(await generateStructured(options), { ok: true });
    failure = { status: 401, type: "authentication_error" };
    await assert.rejects(generateStructured(options), (error: unknown) => error instanceof AiRuntimeError && error.code === "configuration" && !error.message.includes("Private"));
    Object.assign(process.env, { NODE_ENV: "production" });
    for (const expected of [
      { status: 401, type: "authentication_error", code: "configuration" },
      { status: 403, type: "forbidden", code: "configuration" },
      { status: 402, type: "insufficient_credits", code: "credits" },
    ]) {
      failure = expected;
      await assert.rejects(generateStructured(options), (error: unknown) => error instanceof AiRuntimeError && error.code === expected.code && !error.message.includes("Private"));
    }
    assert.equal(calls, 5);
  } finally {
    globalThis.AI_SDK_DEFAULT_PROVIDER = previousProvider;
    if (previousContext === undefined) delete globals[contextSymbol];
    else globals[contextSymbol] = previousContext;
    for (const name of names) {
      if (previous[name] === undefined) Reflect.deleteProperty(process.env, name);
      else Reflect.set(process.env, name, previous[name]);
    }
  }
});

test("generation cancellation interrupts a pending model with a retryable public timeout", async () => {
  const model = new MockLanguageModelV4({ doGenerate: async ({ abortSignal }) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Test exceeded its bound")), 1000);
    abortSignal?.addEventListener("abort", () => { clearTimeout(timer); reject(abortSignal.reason); }, { once: true });
  }) });
  await assert.rejects(generateStructured({ schema: z.object({ ok: z.boolean() }), instructions: "Test", prompt: "Test", operation: "chat", model, signal: AbortSignal.timeout(10) }), (error: unknown) => error instanceof AiRuntimeError && error.code === "timeout");
  assert.equal(model.doGenerateCalls.length, 1);
});
