import assert from "node:assert/strict";
import test from "node:test";
import { APICallError, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { AiRuntimeError, generateStructured, publicAiError } from "./ai-runtime";

test("direct structured generation reserves Gemini output budget without demanding tool references", async (t) => {
  const logged: [string, Record<string, unknown>][] = [];
  t.mock.method(console, "info", (name: string, fields: Record<string, unknown>) => { logged.push([name, fields]); });
  for (const modelId of ["google/gemini-2.5-flash", "another-model"]) {
    const model = new MockLanguageModelV4({ modelId, doGenerate: async () => ({
      content: [{ type: "text", text: '{"ok":true}' }],
      finishReason: { unified: "stop", raw: "private provider text" },
      usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 5, reasoning: 15 } },
      warnings: [],
    }) });
    assert.deepEqual(await generateStructured({ schema: z.object({ ok: z.boolean() }), instructions: "Create structured content.", prompt: "sample kitchen", operation: "suggest", model }), { ok: true });
    const call = model.doGenerateCalls[0];
    assert.equal(model.doGenerateCalls.length, 1);
    assert.equal(call.maxOutputTokens, 4000);
    assert.equal(call.tools?.length ?? 0, 0);
    assert.equal(call.responseFormat?.type, "json");
    assert.ok(!JSON.stringify(call.prompt).includes("Use only the supplied facts and validated recipe references"));
    if (modelId === "google/gemini-2.5-flash") {
      assert.deepEqual(call.providerOptions?.google, { thinkingConfig: { thinkingBudget: 512, includeThoughts: false } });
      assert.deepEqual(call.providerOptions?.vertex, { thinkingConfig: { thinkingBudget: 512, includeThoughts: false } });
    } else {
      assert.equal(call.providerOptions?.google, undefined);
      assert.equal(call.providerOptions?.vertex, undefined);
    }
    assert.equal(logged.at(-1)?.[1].reasoningTokens, 15);
    assert.deepEqual(logged.at(-1)?.[1].finishReasons, ["stop"]);
    assert.ok(!JSON.stringify(logged).includes("private"));
  }
});

function providerError(headers: Record<string, string> = {}, statusCode = 429) {
  return new APICallError({
    message: "private provider message",
    url: "https://provider.example/private-token",
    requestBodyValues: { prompt: "private pantry" },
    statusCode,
    responseHeaders: { authorization: "private credential", ...headers },
    responseBody: "private response body",
  });
}

function gatewayError(headers: Record<string, string> = {}) {
  return Object.assign(new Error("private gateway message", { cause: providerError(headers) }), {
    name: "GatewayRateLimitError",
    statusCode: 429,
    type: "rate_limit_exceeded",
    generationId: "gen_test-123",
  });
}

test("rate-limit timing survives direct and nested SDK errors without shortening long waits", () => {
  for (const [headers, expected] of [
    [{ "retry-after": "90" }, 90],
    [{ "Retry-After": "172800" }, 172800],
    [{ "retry-after-ms": "2500", "retry-after": "10" }, 3],
    [{ "retry-after-ms": "bad", "retry-after": "75" }, 75],
    [{ "retry-after": "0" }, 1],
  ] as const) {
    for (const error of [providerError(headers), gatewayError(headers)]) {
      const result = publicAiError(error);
      assert.equal(result.code, "rate_limit");
      assert.equal(result.status, 429);
      assert.equal(result.retryAfterSeconds, expected);
      const preserved = publicAiError(new AiRuntimeError(result.code, { retryAfterSeconds: result.retryAfterSeconds }));
      assert.equal(preserved.retryAfterSeconds, expected);
      assert.ok(!JSON.stringify(result).includes("private"));
    }
  }
});

test("HTTP-date retry headers become future whole seconds and malformed timing is ignored", () => {
  const future = new Date(Date.now() + 90_000).toUTCString();
  const seconds = publicAiError(gatewayError({ "retry-after": future })).retryAfterSeconds;
  assert.ok(seconds !== undefined && seconds >= 89 && seconds <= 90);
  for (const header of ["", "-3", "NaN", "Infinity", "30 private provider text", "99999999999999999999999", "Wed, 01 Jan 2020 00:00:00 GMT"]) {
    assert.equal(publicAiError(gatewayError({ "retry-after": header })).retryAfterSeconds, undefined);
  }
  assert.equal(publicAiError(providerError({ "retry-after": "120" }, 402)).code, "credits");
  assert.equal(publicAiError(providerError({ "retry-after": "120" }, 402)).retryAfterSeconds, undefined);
});

test("nested error inspection is bounded and does not expose arbitrary diagnostic fields", async (t) => {
  const cyclic = Object.assign(new Error("private message"), {
    statusCode: 429,
    type: "private provider classification",
    generationId: "private id\nwith text",
    cause: undefined as unknown,
  });
  cyclic.cause = cyclic;
  const logged: unknown[][] = [];
  t.mock.method(console, "info", (...args: unknown[]) => { logged.push(args); });
  const model = new MockLanguageModelV4({ doGenerate: async () => { throw cyclic; } });
  await assert.rejects(generateStructured({ schema: z.object({ ok: z.boolean() }), instructions: "private instructions", prompt: "private pantry", operation: "suggest", model }), (error: unknown) => error instanceof AiRuntimeError && error.code === "rate_limit");
  assert.equal(model.doGenerateCalls.length, 1);
  const output = JSON.stringify(logged);
  assert.ok(!output.includes("private"));
  assert.ok(!output.includes("upstreamErrorType"));
  assert.ok(!output.includes("generationId"));
  assert.match(output, /"upstreamStatus":429/);
});

test("runtime preserves cooldown and logs safe diagnostics for preparation and finalization without retries", async (t) => {
  const logged: [string, Record<string, unknown>][] = [];
  t.mock.method(console, "info", (name: string, fields: Record<string, unknown>) => { logged.push([name, fields]); });
  for (const failurePhase of ["prepare", "finalize"] as const) {
    let calls = 0;
    const model = new MockLanguageModelV4({ modelId: "google/gemini-2.5-flash", doGenerate: async () => {
      calls++;
      if (failurePhase === "finalize" && calls === 1) {
        return {
          content: [{ type: "tool-call", toolCallId: "inspect-1", toolName: "inspectKitchen", input: "{}" }],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 5, text: 5, reasoning: undefined } },
          warnings: [],
        };
      }
      throw gatewayError({ "retry-after": "120" });
    } });
    await assert.rejects(generateStructured({
      schema: z.object({ ok: z.boolean() }),
      instructions: "private instructions",
      prompt: "private pantry",
      operation: "suggest",
      model,
      tools: { inspectKitchen: tool({ inputSchema: z.object({}), execute: async () => ({ ok: true }) }) },
      toolPhaseComplete: () => true,
    }), (error: unknown) => error instanceof AiRuntimeError && error.code === "rate_limit" && error.retryAfterSeconds === 120 && !error.message.includes("private"));
    assert.equal(model.doGenerateCalls.length, failurePhase === "prepare" ? 1 : 2);
    for (const call of model.doGenerateCalls) {
      assert.deepEqual(call.providerOptions?.google, { thinkingConfig: { thinkingBudget: 512, includeThoughts: false } });
      assert.deepEqual(call.providerOptions?.vertex, { thinkingConfig: { thinkingBudget: 512, includeThoughts: false } });
    }
    const [event, fields] = logged.at(-1)!;
    assert.equal(event, "lunchbox_ai");
    assert.equal(fields.phase, failurePhase);
    assert.equal(fields.outcome, "rate_limit");
    assert.equal(fields.upstreamStatus, 429);
    assert.equal(fields.upstreamErrorType, "rate_limit_exceeded");
    assert.equal(fields.generationId, "gen_test-123");
    assert.equal(fields.retryAfterSeconds, 120);
    assert.ok(!JSON.stringify(fields).includes("private"));
  }
});
