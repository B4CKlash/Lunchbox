import { z } from "zod";
import { chatMealsRequestSchema, chatMealsResponseSchema, householdStateSchema, importRecipeRequestSchema, importRecipeResponseSchema, pilotOperationSchema, profileFactChangeSchema, recipeSchema, suggestMealsRequestSchema, suggestMealsResponseSchema } from "@/lib/contracts";

/** Transport envelopes reuse the application's canonical recipe/domain schemas. */
export const aiJobRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("planning"), message: z.string().trim().min(1).max(2000) }),
  z.object({ kind: z.literal("suggest"), input: suggestMealsRequestSchema }),
  z.object({ kind: z.literal("chat"), input: chatMealsRequestSchema }),
  z.object({ kind: z.literal("extract"), input: importRecipeRequestSchema }),
]);
export const planningResultSchema = z.object({
  reply: z.string().min(1).max(4000),
  recipes: z.array(recipeSchema).max(10),
  operations: z.array(pilotOperationSchema).max(30),
  profileChanges: z.array(profileFactChangeSchema).max(10).optional(),
});
export const aiJobResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("planning"), data: planningResultSchema }),
  z.object({ kind: z.literal("suggest"), data: suggestMealsResponseSchema }),
  z.object({ kind: z.literal("chat"), data: chatMealsResponseSchema }),
  z.object({ kind: z.literal("extract"), data: importRecipeResponseSchema }),
]);
export const enqueueAiJobSchema = z.object({
  id: z.uuid(), householdId: z.uuid(), expectedRevision: z.number().int().nonnegative(),
  sessionId: z.string().min(1).max(120), request: aiJobRequestSchema,
});
export const aiJobSchema = z.object({
  id: z.uuid(), householdId: z.uuid(), sessionId: z.string(), householdRevision: z.number().int().nonnegative(),
  kind: z.enum(["planning", "suggest", "chat", "extract"]), request: aiJobRequestSchema,
  actorMemberId: z.string().min(1).max(120).optional(),
  status: z.enum(["queued", "running", "completed", "cancelled", "stale", "failed"]),
  result: aiJobResultSchema.nullable(), error: z.string().nullable(), attempts: z.number().int().nonnegative(),
  createdAt: z.string(), updatedAt: z.string(),
});
export const claimedAiJobSchema = aiJobSchema.extend({ context: householdStateSchema, actorMemberId: z.string().min(1).max(120), leaseToken: z.uuid(), leaseExpiresAt: z.string() });
export const workerActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("heartbeat"), jobId: z.uuid(), leaseToken: z.uuid() }),
  z.object({ action: z.literal("complete"), jobId: z.uuid(), leaseToken: z.uuid(), result: aiJobResultSchema }),
  z.object({ action: z.literal("fail"), jobId: z.uuid(), leaseToken: z.uuid(), error: z.string().min(1).max(1000) }),
]);
export type AiJobRequest = z.infer<typeof aiJobRequestSchema>;
export type AiJobResult = z.infer<typeof aiJobResultSchema>;
export type AiJob = z.infer<typeof aiJobSchema>;
export type ClaimedAiJob = z.infer<typeof claimedAiJobSchema>;
export type EnqueueAiJob = z.infer<typeof enqueueAiJobSchema>;

export function isWorkerOnline(lastSeenAt: string | null | undefined, now = Date.now()) {
  if (!lastSeenAt) return false;
  const age = now - Date.parse(lastSeenAt);
  return Number.isFinite(age) && age >= -30_000 && age < 120_000;
}

/** Private context and the lease are exposed only to the authenticated worker. */
export function publicAiJob(row: Record<string, unknown>): AiJob {
  return aiJobSchema.parse({
    id: row.id, householdId: row.household_id, sessionId: row.session_id, householdRevision: row.household_revision,
    kind: row.kind, request: row.request, status: row.status, result: row.result, error: row.error,
    attempts: row.attempts, createdAt: row.created_at, updatedAt: row.updated_at,
  });
}
