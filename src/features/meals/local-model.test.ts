import assert from "node:assert/strict";
import test from "node:test";
import { localModelSettings } from "./local-model";

test("local inference rejects remote endpoints, credentials, cloud models and redirects", () => {
  for (const url of ["https://ollama.com", "http://192.168.1.9:11434", "http://localhost.evil.test", "http://secret@localhost:11434", "http://localhost/path"]) {
    assert.throws(() => localModelSettings({ LUNCHBOX_OLLAMA_URL: url }));
  }
  assert.throws(() => localModelSettings({ LUNCHBOX_LOCAL_MODEL: "qwen:cloud" }));
  assert.throws(() => localModelSettings({}), /explicitly evaluated/);
  const configured = { LUNCHBOX_LOCAL_MODEL: "qwen3.5:27b" };
  assert.equal(localModelSettings(configured).model, "qwen3.5:27b");
  assert.equal(localModelSettings(configured).url, "http://127.0.0.1:11435");
  assert.equal(localModelSettings(configured).thinking, "off");
  assert.equal(localModelSettings({ ...configured, LUNCHBOX_LOCAL_THINKING: "on" }).thinking, "on");
  assert.throws(() => localModelSettings({ ...configured, LUNCHBOX_LOCAL_THINKING: "medium" }));
});
