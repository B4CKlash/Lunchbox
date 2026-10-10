import { setTimeout as delay } from "node:timers/promises";
import { claimedAiJobSchema, aiJobResultSchema, type AiJobResult, type ClaimedAiJob } from "../src/features/meals/jobs";
import { createLocalModel, verifyLocalModel } from "../src/features/meals/local-model";
import { runLocalPlanning } from "../src/features/meals/local-planner";
import { liveChatAboutMeals, liveSuggestMeals } from "../src/features/meals/live-provider";
import { explicitProfileReply, extractExplicitProfileChanges } from "../src/features/planning/profile";
import { importRecipe } from "../src/features/meals/import-provider";
import { publicAiError } from "../src/features/meals/ai-runtime";

try { process.loadEnvFile(".env.local"); } catch { /* Environment injection also works. */ }

const workerErrorCodes = new Set(["invalid_result", "lease_lost", "actor_unavailable", "invalid_request", "worker_not_authorized", "worker_unconfigured", "household_unconfigured", "storage_unavailable"]);
class WorkerServiceError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Worker service returned HTTP ${status}.`);
  }
}

export function workerEndpoint(value: string) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new Error("The worker requires an HTTPS app URL or a loopback HTTP development URL.");
  }
  return new URL("/api/household/jobs/worker", url).href;
}

async function main() {
  const endpoint = workerEndpoint(process.env.LUNCHBOX_APP_URL || "http://127.0.0.1:3000");
  const token = process.env.LUNCHBOX_WORKER_TOKEN;
  if (!token || token.length < 32) throw new Error("Set LUNCHBOX_WORKER_TOKEN to the server's worker credential.");
  await verifyLocalModel();
  const shutdown = new AbortController();
  process.once("SIGINT", () => shutdown.abort());
  process.once("SIGTERM", () => shutdown.abort());
  const call = async (body: unknown, signal?: AbortSignal) => {
    const response = await fetch(endpoint, {
      method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`,
        ...(endpoint.startsWith("https:") && process.env.VERCEL_OIDC_TOKEN ? { "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([AbortSignal.timeout(15000), shutdown.signal, ...(signal ? [signal] : [])]),
    });
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null);
      const code = failure && typeof failure === "object" && "code" in failure && typeof failure.code === "string" && workerErrorCodes.has(failure.code) ? failure.code : "unexpected_status";
      throw new WorkerServiceError(response.status, code);
    }
    return await response.json() as { job?: unknown; active?: boolean };
  };
  console.info("LunchBox local worker is online. Inference stays on this Mac.");
  while (!shutdown.signal.aborted) {
    try {
      const claimed = await call({ action: "claim" });
      if (!claimed.job) {
        if (process.argv.includes("--once")) break;
        await delay(5000, undefined, { signal: shutdown.signal });
        continue;
      }
      const job = claimedAiJobSchema.parse(claimed.job);
      const controller = new AbortController();
      const signal = AbortSignal.any([shutdown.signal, controller.signal]);
      let heartbeatRunning = false;
      const heartbeat = setInterval(async () => {
        if (heartbeatRunning || signal.aborted) return;
        heartbeatRunning = true;
        try {
          const result = await call({ action: "heartbeat", jobId: job.id, leaseToken: job.leaseToken }, signal);
          if (!result.active) controller.abort(new Error("The request was cancelled or its lease ended."));
        } catch { controller.abort(new Error("The worker lost its server connection.")); }
        finally { heartbeatRunning = false; }
      }, 20000);
      let stage: "generation" | "result-validation" | "completion" = "generation";
      try {
        const candidate = await processJob(job, signal);
        stage = "result-validation";
        const result = aiJobResultSchema.parse(candidate);
        signal.throwIfAborted();
        // Retry only this exact completion. Server deduplicates the job/lease;
        // a lost response cannot cause a second generation or household action.
        let delivered = false;
        stage = "completion";
        for (let attempt = 0; attempt < 3 && !delivered; attempt++) {
          try { await call({ action: "complete", jobId: job.id, leaseToken: job.leaseToken, result }, signal); delivered = true; }
          catch (error) {
            if (attempt === 2 || signal.aborted) throw error;
            await delay(1000, undefined, { signal });
          }
        }
        console.info("Local AI job completed", { kind: job.kind });
      } catch (error) {
        if (!shutdown.signal.aborted && !controller.signal.aborted) {
          const message = error instanceof Error ? error.message : "The local model could not produce a valid reply.";
          await call({ action: "fail", jobId: job.id, leaseToken: job.leaseToken, error: message.slice(0, 1000) }).catch(() => undefined);
        }
        // Only application-owned categories are diagnostic output. Never log
        // model text, raw errors, request context, credentials, or URLs.
        console.warn("Local AI job ended without an accepted result", {
          kind: job.kind, cancelled: signal.aborted, stage,
          code: error instanceof WorkerServiceError ? error.code : publicAiError(error).code,
          ...(error instanceof WorkerServiceError ? { status: error.status } : {}),
        });
      } finally { clearInterval(heartbeat); }
      if (process.argv.includes("--once")) break;
    } catch {
      if (shutdown.signal.aborted) break;
      console.warn("Worker connection unavailable; retrying in five seconds.");
      if (process.argv.includes("--once")) throw new Error("The worker could not claim a job.");
      await delay(5000, undefined, { signal: shutdown.signal }).catch(() => undefined);
    }
  }
}

export async function processJob(job: ClaimedAiJob, signal: AbortSignal): Promise<AiJobResult> {
  await verifyLocalModel(process.env, signal);
  const model = createLocalModel();
  switch (job.request.kind) {
    case "planning": return { kind: "planning", data: await runLocalPlanning(job.context, job.request.message, { model, signal, verify: false, actorMemberId: job.actorMemberId }) };
    case "suggest": return { kind: "suggest", data: await liveSuggestMeals({ ...job.request.input, pantry: job.context.pantry, preferences: job.context.preferences }, { model, signal, householdContext: job.context, actorMemberId: job.actorMemberId }) };
    case "chat": {
      const input = job.request.input;
      const profileChanges = extractExplicitProfileChanges(job.context, input.message, job.actorMemberId);
      const reply = explicitProfileReply(job.context, input.message, job.actorMemberId);
      const data = reply ? { source: "ai" as const, reply, recipes: [], servings: job.context.preferences.servings }
        : await liveChatAboutMeals({ ...input, pantry: job.context.pantry, preferences: job.context.preferences, recipeBox: job.context.workspace.recipeBox }, { model, signal, householdContext: job.context, actorMemberId: job.actorMemberId });
      return { kind: "chat", data: { ...data, ...(profileChanges.length ? { profileChanges } : {}) } };
    }

    case "extract": return { kind: "extract", data: await importRecipe(job.request.input, { model, signal }) };
  }
}

if (process.argv[1]?.endsWith("local-ai-worker.ts")) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "Local worker failed."); process.exitCode = 1; });
}
