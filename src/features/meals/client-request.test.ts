import assert from "node:assert/strict";
import test from "node:test";
import { mealFailureMessage, mealRequestError, mealRequestFailure, mealRetryAt } from "./client-request";

test("Retry-After supports seconds and HTTP dates without shortening long waits", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  assert.equal(mealRetryAt("120", now), now + 120_000);
  assert.equal(mealRetryAt("Tue, 29 Sep 2026 12:05:00 GMT", now), now + 300_000);
  assert.equal(mealRetryAt("Tue, 29 Sep 2026 11:00:00 GMT", now), now);
  for (const header of [null, "", "-1", "+5", "not a date", "999999999999999999999"])
    assert.equal(mealRetryAt(header, now), now + 30_000);
});

test("busy failures retain HTTP status and retry deadline without exposing firewall HTML", async () => {
  const before = Date.now();
  const failure = await mealRequestFailure(new Response("<html>private</html>", { status: 429, headers: { "Retry-After": "120" } }));
  assert.equal(failure.status, 429);
  assert.ok(failure.retryAt! >= before + 120_000);
  assert.doesNotMatch(mealFailureMessage(failure), /<html>|private/);
});

test("public API error explains unavailable AI credits", async () => {
  const response = Response.json({ error: "AI credits are unavailable. Your recipe is still here.", code: "credits_unavailable" }, { status: 503 });
  assert.equal(await mealRequestError(response), "AI credits are unavailable. Your recipe is still here.");
});

test("firewall HTML gives a retry hint without exposing markup", async () => {
  const response = new Response("<html>Rate limited</html>", { status: 429 });
  const message = await mealRequestError(response);
  assert.match(message, /Wait a minute/);
  assert.doesNotMatch(message, /<html>/);
});

test("unexpected error objects and empty messages get a useful fallback", async () => {
  for (const error of [{ stack: "private server details" }, ""]) {
    const message = await mealRequestError(Response.json({ error }, { status: 500 }));
    assert.match(message, /changes are still here/);
    assert.doesNotMatch(message, /private server details/);
  }
});

test("browser deadline explains that input is retained", () => {
  assert.match(mealFailureMessage(new DOMException("Timed out", "TimeoutError")), /taking too long.*input is still here/);
});
