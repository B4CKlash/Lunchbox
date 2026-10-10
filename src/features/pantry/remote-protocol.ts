import { z } from "zod";
import { householdStateSchema, householdActionSchema, pilotCommandSchema } from "@/lib/contracts";

export const remoteHouseholdSchema = z.object({
  householdId: z.uuid(),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  state: householdStateSchema,
  currentMemberId: z.string().min(1).max(120).optional(),
});
export type RemoteHousehold = z.infer<typeof remoteHouseholdSchema>;
export const householdMutationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pilot"), command: pilotCommandSchema }),
  z.object({ kind: z.literal("legacy"), action: householdActionSchema }),
]);
export type HouseholdMutation = z.infer<typeof householdMutationSchema>;
export const remoteCommandSchema = z.object({
  householdId: z.uuid(),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  commandId: z.uuid(),
  command: householdMutationSchema,
});
export type RemoteCommand = z.infer<typeof remoteCommandSchema>;
