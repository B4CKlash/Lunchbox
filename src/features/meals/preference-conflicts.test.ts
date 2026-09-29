import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDietaryNeeds,
  updateDietarySelection,
} from "./preference-conflicts";

test("selecting a primary eating pattern replaces the previous pattern", () => {
  assert.deepEqual(
    updateDietarySelection(["vegan", "nut-free"], "pescatarian"),
    {
      values: ["nut-free", "pescatarian"],
      replaced: "vegan",
    },
  );
});

test("restriction modifiers combine and existing conflicting saves normalize", () => {
  assert.deepEqual(
    updateDietarySelection(["pescatarian"], "dairy-free").values,
    ["pescatarian", "dairy-free"],
  );
  assert.deepEqual(
    normalizeDietaryNeeds(["vegan", "vegetarian", "gluten-free"]),
    ["vegan", "gluten-free"],
  );
});

test("no specific diet acts as a mutually exclusive primary pattern", () => {
  assert.deepEqual(
    updateDietarySelection(["vegetarian", "dairy-free"], "omnivore"),
    {
      values: ["dairy-free", "omnivore"],
      replaced: "vegetarian",
    },
  );
});
