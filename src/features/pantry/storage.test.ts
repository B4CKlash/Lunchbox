import assert from "node:assert/strict";
import test from "node:test";
import { householdStateSchema } from "@/lib/contracts";
import { createSampleHousehold } from "./seed";
import { HOUSEHOLD_STORAGE_KEY, loadHousehold, saveHousehold } from "./storage";

test("sample households satisfy the contract and do not share mutable data", () => {
  const first = createSampleHousehold();
  const second = createSampleHousehold();
  assert.equal(householdStateSchema.safeParse(first).success, true);
  assert.equal(first.pantry.length, 10);
  assert.deepEqual(first.meals, []);
  first.pantry[0].quantity = 0;
  assert.equal(second.pantry[0].quantity, 800);
});

test("a saved household round-trips with edits and preferences intact", () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
  };
  const state = createSampleHousehold();
  state.pantry[0].quantity = 650;
  state.preferences.servings = 4;
  saveHousehold(storage, state);
  assert.ok(saved.has(HOUSEHOLD_STORAGE_KEY));
  assert.deepEqual(loadHousehold(storage), state);
});

test("missing, corrupt, incompatible, and invalid saves fall back safely", () => {
  const state = createSampleHousehold();
  for (const stored of [
    null,
    "{broken",
    "null",
    JSON.stringify({ ...state, version: 2 }),
    JSON.stringify({
      ...state,
      pantry: [{ ...state.pantry[0], quantity: -1 }],
    }),
  ]) {
    assert.equal(loadHousehold({ getItem: () => stored }), null);
  }
  assert.equal(
    loadHousehold({
      getItem: () => {
        throw new Error("Storage disabled");
      },
    }),
    null,
  );
});

test("storage write failures reach the caller instead of claiming a successful save", () => {
  assert.throws(
    () =>
      saveHousehold(
        {
          setItem: () => {
            throw new Error("Quota exceeded");
          },
        },
        createSampleHousehold(),
      ),
    /Quota exceeded/,
  );
});
