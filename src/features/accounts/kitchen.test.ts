import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSampleHousehold } from "@/features/pantry/seed";
import { loadAccountKitchen, saveAccountKitchen } from "./kitchen";

function mockClient(userId: string | null, stored: unknown = null, fail = false) {
  const writes: unknown[] = [];
  const filters: unknown[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    from: (table: string) => {
      assert.equal(table, "account_kitchens");
      return {
        upsert: async (row: unknown) => { writes.push(row); return { error: fail ? new Error("Denied") : null }; },
        select: () => ({ eq: (column: string, value: string) => {
          filters.push([column, value]);
          return { maybeSingle: async () => ({ data: stored === null ? null : { state: stored }, error: fail ? new Error("Denied") : null }) };
        } }),
      };
    },
  } as unknown as SupabaseClient;
  return { client, writes, filters };
}

test("account writes use verified user identity and preserve the full workspace", async () => {
  const { client, writes } = mockClient("owner-a");
  const state = createSampleHousehold();
  state.workspace.chatDraft = "Keep my recipes";
  await saveAccountKitchen(client, state);
  assert.equal(writes.length, 1);
  assert.deepEqual((writes[0] as { state: unknown }).state, state);
  assert.equal((writes[0] as { user_id: string }).user_id, "owner-a");
});

test("signed-out users cannot read or write kitchen data", async () => {
  const { client, writes, filters } = mockClient(null);
  await assert.rejects(saveAccountKitchen(client, createSampleHousehold()), /Sign in/);
  await assert.rejects(loadAccountKitchen(client), /Sign in/);
  assert.deepEqual(writes, []);
  assert.deepEqual(filters, []);
});

test("account reads scope by user and validate saved data before replacement", async () => {
  const state = createSampleHousehold();
  const { client, filters } = mockClient("owner-b", state);
  assert.deepEqual(await loadAccountKitchen(client), state);
  assert.deepEqual(filters, [["user_id", "owner-b"]]);
  assert.equal(await loadAccountKitchen(mockClient("owner-b").client), null);
  await assert.rejects(loadAccountKitchen(mockClient("owner-b", { version: 999 }).client), /incompatible/);
});

test("invalid writes and provider failures do not claim a successful save", async () => {
  const { client, writes } = mockClient("owner-a");
  const state = createSampleHousehold();
  state.pantry[0].quantity = -1;
  await assert.rejects(saveAccountKitchen(client, state));
  assert.deepEqual(writes, []);
  await assert.rejects(saveAccountKitchen(mockClient("owner-a", null, true).client, createSampleHousehold()), /could not be saved/);
  await assert.rejects(loadAccountKitchen(mockClient("owner-a", null, true).client), /could not be loaded/);
});
