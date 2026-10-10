import { calendarDateSchema, recipeSchema, type HouseholdState, type PilotChange, type PilotOperation } from "@/lib/contracts";
import { calendarDates } from "./calendar";

type Placement = Extract<PilotChange, { type: "create_batch" }>;

/** Only a literal, fully grounded single placement can bypass proposal review.
 * The server separately binds these arguments to the completed worker job.
 */
export function directPlacementForRequest(state: HouseholdState, request: string, actorMemberId: string, operations: PilotOperation[]): Placement | null {
  const pilot = state.pilot;
  if (!pilot || !pilot.members.some((member) => member.id === actorMemberId) || operations.length !== 1 || operations[0].type !== "create_batch") return null;
  const recipe = pilot.session.candidates.find((candidate) => candidate.id === pilot.session.focusedRecipeId);
  if (!recipe) return null;
  const text = request.trim().replace(/\s+/g, " ").toLowerCase();
  const verb = /^(?:please )?(?:put|place|schedule) (.+)$/.exec(text);
  if (!verb) return null;
  const names = ["this", "it", "the focused recipe", "focused recipe", recipe.name, `the ${recipe.name}`, `the focused ${recipe.name}`].map((name) => name.toLowerCase()).sort((a, b) => b.length - a.length);
  const reference = names.find((name) => verb[1].startsWith(`${name} `));
  if (!reference) return null;
  const tail = verb[1].slice(reference.length).trim();
  const match = /^(?:(?:on|for) )?(\d{4}-\d{2}-\d{2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?: (breakfast|lunch|snack|dinner))?(?: for (both of us|both|us|me|myself))?(?:,? (one|1) portion( each)?)?[.!]?$/.exec(tail);
  if (!match) return null;
  let date = match[1];
  if (!calendarDateSchema.safeParse(date).success) {
    const day = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(date);
    const matches = calendarDates(pilot.session.startDate, pilot.session.days).filter((candidate) => new Date(`${candidate}T12:00:00`).getDay() === day);
    if (matches.length !== 1) return null;
    date = matches[0];
  }
  const slot = match[2] ?? pilot.session.focusSlot ?? "lunch";
  if (!pilot.session.slots.some((entry) => entry === slot)) return null;
  const audience = match[3];
  if ((audience === "both" || audience === "both of us") && pilot.members.length !== 2) return null;
  const memberIds = audience === "me" || audience === "myself" ? [actorMemberId]
    : audience === "both" || audience === "both of us" || audience === "us" ? pilot.members.map((member) => member.id) : pilot.session.memberIds;
  if (!memberIds.length || new Set(memberIds).size !== memberIds.length) return null;
  if (match[4] && !match[5] && memberIds.length > 1) return null;
  const change = operations[0];
  if (JSON.stringify(recipeSchema.parse(change.batch.recipe)) !== JSON.stringify(recipeSchema.parse(recipe))
    || change.batch.prepareDate !== date || change.batch.yield !== memberIds.length || change.batch.reservedExtra !== 0
    || change.allocations.length !== memberIds.length || new Set(change.allocations.map((entry) => entry.memberId)).size !== memberIds.length
    || new Set(change.allocations.map((entry) => entry.id)).size !== change.allocations.length
    || pilot.batches.some((batch) => batch.id === change.batch.id)) return null;
  for (const allocation of change.allocations) {
    if (!memberIds.includes(allocation.memberId) || allocation.batchId !== change.batch.id || allocation.date !== date || allocation.slot !== slot || allocation.portions !== 1
      || pilot.allocations.some((entry) => entry.id === allocation.id || (entry.memberId === allocation.memberId && entry.date === date && entry.slot === slot))
      || pilot.coverage.some((entry) => entry.memberId === allocation.memberId && entry.date === date && entry.slot === slot)) return null;
  }
  return structuredClone(change);
}
