import assert from "node:assert/strict";
import test from "node:test";
import { planningUserMessageAuthor } from "./planning-message-author";

test("shared transcript retains original authors across viewers and does not invent legacy authors", () => {
  const members = [{ id: "owner", name: "Nate" }, { id: "partner", name: "Alex" }];
  const label = (authorMemberId: string | undefined, viewerMemberId: string | null, shared = true) => planningUserMessageAuthor({ authorMemberId, viewerMemberId, members, shared });
  assert.equal(label("owner", "owner"), "You");
  assert.equal(label("owner", "partner"), "Nate", "resuming an owner's job as partner must retain its original author");
  assert.equal(label("partner", "owner"), "Alex");
  assert.equal(label(undefined, "partner"), "Household member");
  assert.equal(label("removed-member", "partner"), "Household member");
  assert.equal(label(undefined, null, false), "You", "anonymous legacy browser history retains its existing label");
  assert.equal(label("owner", null), "Nate", "loading the viewer mapping must not claim authorship");
  assert.equal(planningUserMessageAuthor({ authorMemberId: "owner", viewerMemberId: "partner", members: [{ id: "owner", name: "You" }], shared: true }), "Other household member");
});
