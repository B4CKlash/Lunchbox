import assert from "node:assert/strict";
import test from "node:test";
import { localModelSettings } from "./local-model";

test("local inference rejects remote endpoints, credentials, cloud models and redirects", () => {
  for (const url of ["https://ollama.com", "http://192.168.1.9:11434", "http://localhost.evil.test", "http://secret@localhost:11434", "http://localhost/path"]) {
    assert.throws(() => localModelSettings({ LUNCHBOX_OLLAMA_URL: url }));
  }
  assert.throws(() => localModelSettings({ LUNCHBOX_LOCAL_MODEL: "qwen:cloud" }));
  assert.equal(localModelSettings({}).model, "qwen3.5:9b");
  assert.equal(localModelSettings({}).url, "http://127.0.0.1:11435");
});
