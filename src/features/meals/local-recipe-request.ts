import { loadRemoteHousehold } from "@/features/pantry/remote";
import { requestLocalAiJob, readLocalAiJob, cancelLocalAiJob } from "./jobs-client";
import { aiJobRequestSchema, type AiJobRequest, type AiJob } from "./jobs";

/** One active worker job, polled only until completion. Cancellation is persisted. */
export async function requestWorkerRecipeJob(request: AiJobRequest, signal: AbortSignal): Promise<AiJob> {
  aiJobRequestSchema.parse(request);
  signal.throwIfAborted();
  const household = await loadRemoteHousehold(signal);
  if (!household?.state.pilot) throw new Error("Create or join a household in Your account to use local AI. Manual planning still works.");
  const id = crypto.randomUUID();
  let completed = false;
  try {
    let result = await requestLocalAiJob({ id, householdId: household.householdId, expectedRevision: household.revision,
      sessionId: household.state.pilot.session.id, request });
    while (true) {
      signal.throwIfAborted();
      if (result.job.status === "completed" && result.job.result) {
        completed = true;
        if (result.job.result.kind !== request.kind) throw new Error("The assistant returned a different kind of result. Please retry.");
        return result.job;
      }
      if (["stale", "failed", "cancelled"].includes(result.job.status)) throw new Error(result.job.error || "The kitchen changed while AI was working. Please retry with the current kitchen.");
      if (!result.workerOnline) throw new Error("Local AI is offline. Start the Mac worker, then retry. Your saved kitchen and manual planning still work.");
      await new Promise<void>((resolve, reject) => {
        const aborted = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, 1200);
        signal.addEventListener("abort", aborted, { once: true });
      });
      result = await readLocalAiJob(household.householdId, id, signal);
    }
  } finally {
    if (!completed) await cancelLocalAiJob(household.householdId, id).catch(() => undefined);
  }
}

/** Existing suggestion/import callers keep their response adapter; chat retains job proof. */
export async function requestWorkerRecipe(request: AiJobRequest, signal: AbortSignal): Promise<Response> {
  const job = await requestWorkerRecipeJob(request, signal);
  return Response.json(job.result!.data);
}
