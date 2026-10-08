import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Local-only adapter: reject remote hosts and cloud model tags before any request. */
export function localModelSettings(env: Record<string, string | undefined> = process.env) {
  const url = new URL(env.LUNCHBOX_OLLAMA_URL || "http://127.0.0.1:11435");
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Ollama must use a private loopback HTTP address.");
  }
  const model = env.LUNCHBOX_LOCAL_MODEL || "qwen3.5:9b";
  if (!/^[a-zA-Z0-9_.:-]+$/.test(model) || /cloud|remote/i.test(model)) throw new Error("Only an installed local model is allowed.");
  return { url: url.origin, model, digest: env.LUNCHBOX_LOCAL_MODEL_DIGEST };
}

export async function verifyLocalModel(env: Record<string, string | undefined> = process.env, signal?: AbortSignal) {
  const settings = localModelSettings(env);
  const response = await fetch(`${settings.url}/api/tags`, { signal: signal ?? AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Local AI is offline. Start the Mac worker and retry.");
  const body = await response.json() as { models?: { name: string; digest: string; remote_host?: string }[] };
  const installed = body.models?.find((model) => model.name === settings.model);
  if (!installed || installed.remote_host) throw new Error("The configured local model is not installed.");
  if (settings.digest && installed.digest !== settings.digest) throw new Error("The local model changed. Re-evaluate before updating its pinned digest.");
  return { ...settings, digest: installed.digest };
}

export function createLocalModel(env: Record<string, string | undefined> = process.env) {
  const settings = localModelSettings(env);
  return createOpenAICompatible({
    name: "ollama-local",
    baseURL: `${settings.url}/v1`,
    supportsStructuredOutputs: true,
    transformRequestBody: (body) => ({ ...body, reasoning_effort: "none" }),
    fetch: (input, init) => fetch(input, { ...init, redirect: "error" }),
  }).chatModel(settings.model);
}
