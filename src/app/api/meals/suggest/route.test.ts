import { test } from "node:test";
import assert from "node:assert/strict";
import { createMealHandlers } from "@/features/meals/api-handlers";
import { chatAboutMeals } from "@/features/meals/chat-provider";
import { suggestMeals } from "@/features/meals/demo-provider";
import { createSampleHousehold } from "@/features/pantry/seed";
import { suggestMealsResponseSchema } from "@/lib/contracts";
import { AiRuntimeError } from "@/features/meals/ai-runtime";

const POST = createMealHandlers({ chat: chatAboutMeals, suggest: suggestMeals }).suggest;

function request(body: string) {
  return new Request("http://localhost/api/meals/suggest", {
    method: "POST",
    body,
  });
}

test("suggestion API returns the public response contract with demo provenance", async () => {
  const { pantry, preferences } = createSampleHousehold();
  const response = await POST(request(JSON.stringify({ pantry, preferences })));
  assert.equal(response.status, 200);
  const data = suggestMealsResponseSchema.parse(await response.json());
  assert.equal(data.source, "demo");
  assert.ok(data.recipes.length > 0);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("suggestion API rejects malformed and invalid input", async () => {
  assert.equal((await POST(request("bad json"))).status, 400);
  assert.equal(
    (
      await POST(
        request(JSON.stringify({ pantry: [], preferences: { servings: -1 } })),
      )
    ).status,
    400,
  );
  assert.equal((await POST(request("x".repeat(100001)))).status, 413);
  assert.equal((await POST(request("🌱".repeat(25001)))).status, 413);
});

test("suggestion API passes known identities and cancellation to the provider", async () => {
  const { pantry, preferences } = createSampleHousehold();
  const knownIngredients = [{ ingredientId: "favorite-mushrooms", name: "Fresh mushrooms", unit: "g" as const }];
  const input = request(JSON.stringify({ pantry, preferences, knownIngredients }));
  const handler = createMealHandlers({ chat: chatAboutMeals, suggest: async (body, options) => {
    assert.deepEqual(body.knownIngredients, knownIngredients);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    throw new AiRuntimeError("configuration");
  } }).suggest;
  const response = await handler(input);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "configuration");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
