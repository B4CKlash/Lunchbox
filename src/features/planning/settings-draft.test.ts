import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsDraft, resolveSettingsDraft } from "./settings-draft";

test("a partner's person update preserves a dirty local draft and blocks saving until reviewed", () => {
  const original = [{ id: "you", name: "Nate", preferences: "Mild food" }, { id: "partner", name: "Partner", preferences: "" }];
  const initial = createSettingsDraft(original);
  const dirty = { ...initial, values: original.map((member) => member.id === "you" ? { ...member, preferences: "More vegetables" } : member) };
  const incoming = original.map((member) => member.id === "you" ? { ...member, name: "Nathan", preferences: "Less spicy" } : member);
  const result = resolveSettingsDraft(dirty, incoming);
  assert.equal(result.conflict, true);
  assert.equal(result.draft, dirty);
  assert.equal(result.draft.values[0].preferences, "More vegetables");
  assert.equal(result.draft.values[0].name, "Nate");
  const reviewed = createSettingsDraft(incoming);
  assert.deepEqual(resolveSettingsDraft(reviewed, incoming), { draft: reviewed, conflict: false });
});

test("clean settings follow remote updates while unrelated household refreshes preserve edits", () => {
  const original = { equipment: "Oven", memberIds: ["you", "partner"] };
  const clean = createSettingsDraft(original);
  const incoming = { ...original, equipment: "Oven, skillet" };
  const updated = resolveSettingsDraft(clean, incoming);
  assert.deepEqual(updated.draft.values, incoming);
  assert.equal(updated.conflict, false);
  const dirty = { ...updated.draft, values: { ...incoming, equipment: "Skillet" } };
  assert.deepEqual(resolveSettingsDraft(dirty, structuredClone(incoming)), { draft: dirty, conflict: false });
  // Returning fields to their baseline makes it safe to follow current values.
  const reverted = { ...dirty, values: incoming };
  assert.deepEqual(resolveSettingsDraft(reverted, { ...incoming, memberIds: ["partner"] }).draft.values.memberIds, ["partner"]);
});
