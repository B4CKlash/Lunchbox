import { z } from "zod";
import { householdFetch } from "@/features/pantry/remote";
import { aiJobSchema, type EnqueueAiJob } from "./jobs";

const responseSchema = z.object({ job: aiJobSchema, workerOnline: z.boolean(), deferred: z.boolean().optional() });
export async function requestLocalAiJob(input: EnqueueAiJob) {
  return responseSchema.parse(await householdFetch("/jobs", input));
}
export async function readLocalAiJob(householdId: string, id: string, signal?: AbortSignal) {
  return responseSchema.parse(await householdFetch(`/jobs?householdId=${encodeURIComponent(householdId)}&id=${encodeURIComponent(id)}`, undefined, { signal }));
}
export async function cancelLocalAiJob(householdId: string, id: string) {
  return z.object({ job: aiJobSchema }).parse(await householdFetch("/jobs", { householdId, id }, { method: "DELETE" }));
}
export async function readLatestLocalAiJob(householdId: string, sessionId: string, signal?: AbortSignal) {
  return responseSchema.extend({ job: aiJobSchema.nullable() }).parse(await householdFetch(`/jobs?householdId=${encodeURIComponent(householdId)}&sessionId=${encodeURIComponent(sessionId)}&kind=planning`, undefined, { signal }));
}
