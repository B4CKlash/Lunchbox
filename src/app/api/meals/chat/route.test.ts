import test from "node:test";
import assert from "node:assert/strict";
import { createMealHandlers } from "@/features/meals/api-handlers";
import { chatAboutMeals } from "@/features/meals/chat-provider";
import { suggestMeals } from "@/features/meals/demo-provider";
import { createSampleHousehold } from "@/features/pantry/seed";
import { chatMealsResponseSchema } from "@/lib/contracts";
import { AiRuntimeError } from "@/features/meals/ai-runtime";

const POST = createMealHandlers({ chat: chatAboutMeals, suggest: suggestMeals }).chat;

function request(body: string) {
  return new Request("http://localhost/api/meals/chat", { method: "POST", body });
}

function context(message = "What can I make tonight?") {
  const { pantry, preferences } = createSampleHousehold();
  return { pantry, preferences, meals: [], recipeBox: [], messages: [], message };
}

test("chat API returns validated demo proposals without caching private kitchen context", async () => {
  const response = await POST(request(JSON.stringify(context())));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const data = chatMealsResponseSchema.parse(await response.json());
  assert.equal(data.source, "demo");
  assert.equal(data.recipes.length, 3);
  assert.equal(data.servings, 2);
});

test("chat API preserves focused portions and returns current portions for new suggestions", async () => {
  const initial = await POST(request(JSON.stringify(context())));
  const { recipes } = chatMealsResponseSchema.parse(await initial.json());
  const input = {
    ...context("What do I need for this recipe?"),
    focusedRecipe: recipes[0],
    focusedServings: 6,
  };
  const focused = await POST(request(JSON.stringify(input)));
  assert.equal(chatMealsResponseSchema.parse(await focused.json()).servings, 6);
  input.message = "What can I make tonight?";
  const ordinary = await POST(request(JSON.stringify(input)));
  assert.equal(chatMealsResponseSchema.parse(await ordinary.json()).servings, 2);
});

test("chat API rejects malformed JSON, empty messages, and invalid context", async () => {
  for (const body of [
    "bad json",
    JSON.stringify(context(" ")),
    JSON.stringify(context("x".repeat(1001))),
    JSON.stringify({ ...context(), preferences: { servings: -1 } }),
    JSON.stringify({ ...context(), focusedRecipe: { id: "incomplete" } }),
  ]) {
    const response = await POST(request(body));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(typeof (await response.json()).error, "string");
  }
});

test("chat API caps request bytes before parsing, including multibyte text", async () => {
  for (const body of ["x".repeat(1_000_001), "🌱".repeat(250_001)]) {
    const response = await POST(request(body));
    assert.equal(response.status, 413);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("unsupported requests return an honest reply without unrelated recipe proposals", async () => {
  const response = await POST(request(JSON.stringify(context("Find gluten-free meals"))));
  assert.equal(response.status, 200);
  const data = chatMealsResponseSchema.parse(await response.json());
  assert.deepEqual(data.recipes, []);
  assert.match(data.reply, /haven’t applied those constraints/);
});

test("chat forwards cancellation and returns public AI failures without losing their category", async () => {
  for (const [code, status] of [["timeout", 504], ["credits", 503], ["rate_limit", 429], ["invalid_output", 502]] as const) {
    const input = request(JSON.stringify(context()));
    let forwarded: AbortSignal | undefined;
    const handler = createMealHandlers({ suggest: suggestMeals, chat: async (_body, options) => {
      forwarded = options.signal;
      throw new AiRuntimeError(code);
    } }).chat;
    const response = await handler(input);
    assert.ok(forwarded instanceof AbortSignal);
    assert.equal(forwarded.aborted, false);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    if (code === "rate_limit") assert.equal(response.headers.get("Retry-After"), "30");
  }
});
