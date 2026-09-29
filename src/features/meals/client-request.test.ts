import assert from "node:assert/strict";
import test from "node:test";
import { mealFailureMessage, mealRequestError } from "./client-request";

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
