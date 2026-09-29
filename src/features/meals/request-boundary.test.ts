import assert from "node:assert/strict";
import test from "node:test";
import { createSampleHousehold } from "@/features/pantry/seed";
import { createMealHandlers } from "./api-handlers";
import { chatAboutMeals } from "./chat-provider";
import { suggestMeals } from "./demo-provider";
import { readJsonBody, RequestBodyError, withRequestDeadline } from "./request-boundary";

test("streamed bodies stop at the byte limit rather than being fully buffered", async () => {
  let cancelled = false;
  let reads = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(16)); },
    cancel() { cancelled = true; },
  });
  const request = new Request("http://localhost/api", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readJsonBody(request, { signal: request.signal, maxBytes: 24 }), (error: unknown) => error instanceof RequestBodyError && error.code === "request_too_large");
  assert.equal(cancelled, true);
  assert.ok(reads <= 3);
});

test("the total API deadline includes a stalled body and cancels its reader", async () => {
  let cancelled = false;
  let called = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const request = new Request("http://localhost/api", { method: "POST", body, duplex: "half" } as RequestInit);
  const handlers = createMealHandlers({ chat: chatAboutMeals, suggest: async (input) => { called = true; return suggestMeals(input); } }, { timeoutMs: 10 });
  const response = await handlers.suggest(request);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, "timeout");
  assert.equal(cancelled, true);
  assert.equal(called, false);
});

test("deadline returns even when a provider ignores cancellation", async () => {
  const state = createSampleHousehold();
  let signal: AbortSignal | undefined;
  const handlers = createMealHandlers({ chat: chatAboutMeals, suggest: async (_input, options) => {
    signal = options.signal;
    return new Promise(() => undefined);
  } }, { timeoutMs: 10 });
  const response = await handlers.suggest(new Request("http://localhost/api", { method: "POST", body: JSON.stringify(state) }));
  assert.equal(response.status, 504);
  assert.equal(signal?.aborted, true);
  assert.equal((await response.json()).code, "timeout");
});

test("caller cancellation propagates to request work and retains cancellation category", async () => {
  const controller = new AbortController();
  const work = withRequestDeadline(controller.signal, async (signal) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }), 1000);
  controller.abort();
  await assert.rejects(work, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("body parsing measures UTF-8 bytes and rejects malformed JSON", async () => {
  for (const [body, maxBytes, code] of [["🌱", 3, "request_too_large"], ["not-json", 100, "invalid_request"]] as const) {
    const request = new Request("http://localhost/api", { method: "POST", body });
    await assert.rejects(readJsonBody(request, { signal: request.signal, maxBytes }), (error: unknown) => error instanceof RequestBodyError && error.code === code);
  }
});
