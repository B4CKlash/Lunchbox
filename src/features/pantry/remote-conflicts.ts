import type { RemoteCommand, HouseholdMutation } from "./remote-protocol";

/** Whole-list edits cannot be safely replayed over another person's changes. */
export function canRebaseRemoteCommand(input: Pick<RemoteCommand, "command">) {
  if (input.command.kind === "legacy") return !["setPantry", "setPreferences", "setCalendarDraft", "setCalendarSettings"].includes(input.command.action.type);
  return !["set_session", "receive_planning_result", "receive_recipe_chat_result", "upsert_profile_fact", "remove_profile_fact", "set_members", "set_stock", "record_stock_entries", "set_package_stock", "correct_prepared"].includes(input.command.command.operation.type);
}

/** Queuing must not turn a stale whole-snapshot edit into an authorized rebase. */
export function checkQueuedMutationRevision(command: HouseholdMutation, originRevision: number, currentRevision: number) {
  if (originRevision !== currentRevision && !canRebaseRemoteCommand({ command })) {
    throw new Error("The household changed before this edit could be saved. Review the current information and make the edit again; newer changes were kept.");
  }
}

export function rebaseRemoteCommand(input: RemoteCommand, revision: number): RemoteCommand | null {
  if (!canRebaseRemoteCommand(input)) return null;
  return {
    ...input, expectedRevision: revision,
    command: input.command.kind === "pilot"
      ? { kind: "pilot", command: { ...input.command.command, expectedRevision: revision } }
      : input.command,
  };
}

/** A household cache always belongs to the signed-in account that saved it. */
export function canReadHouseholdCache(cache: { ownerId: string | null; householdId: string | null }, userId: string | null) {
  if (cache.householdId) return Boolean(userId) && cache.ownerId === userId;
  return cache.ownerId === null || cache.ownerId === userId;
}
