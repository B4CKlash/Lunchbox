import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";
import { createSampleHousehold } from "@/features/pantry/seed";
import { suggestMealsResponseSchema } from "@/lib/contracts";

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
});
