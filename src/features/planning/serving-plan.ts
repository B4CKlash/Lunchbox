import { calendarDateSchema, pilotChangeSchema, type HouseholdState, type MealSlot, type PilotChange, type Recipe } from "@/lib/contracts";
import { ensurePilot } from "./pilot";

export type ServingAllocationDraft = {
  id: string;
  memberId: string;
  date: string;
  slot: MealSlot;
  portions: number;
};
export type ServingPlanDraft = {
  prepareDate: string;
  totalPortions: number;
  allocations: ServingAllocationDraft[];
};
type BatchPlacement = Extract<PilotChange, { type: "create_batch" }>;
export type ServingPlanResult =
  | { ok: true; operation: BatchPlacement; allocatedPortions: number; reservedPortions: number }
  | { ok: false; errors: string[] };

const occasion = (row: Pick<ServingAllocationDraft, "memberId" | "date" | "slot">) => JSON.stringify([row.memberId, row.date, row.slot]);

/** Allocate a fixed cooking yield. Distribution never changes ingredient demand. */
export function buildServingPlan(state: HouseholdState, recipe: Recipe, draft: ServingPlanDraft, batchId: string): ServingPlanResult {
  const errors: string[] = [];
  if (!Number.isFinite(draft.totalPortions) || draft.totalPortions <= 0 || draft.totalPortions > 1000) errors.push("Choose a total greater than zero and no more than 1,000 portions.");
  if (!calendarDateSchema.safeParse(draft.prepareDate).success) errors.push("Choose a valid preparation date.");
  if (draft.allocations.length > 200) errors.push("Use no more than 200 meal allocations.");
  if (errors.length) return { ok: false, errors };

  // Always inspect the current snapshot, including edits made after review.
  const pilot = ensurePilot(state, draft.prepareDate).pilot;
  const members = new Set(pilot.members.map((member) => member.id));
  const occupied = new Set([...pilot.coverage, ...pilot.allocations].map(occasion));
  const rows = new Set<string>();
  const allocationIds = new Set(pilot.allocations.map((entry) => entry.id));
  let allocatedPortions = 0;
  if (pilot.batches.some((batch) => batch.id === batchId)) errors.push("This batch has already been planned. Choose a new batch.");
  draft.allocations.forEach((row, index) => {
    const label = `Meal ${index + 1}`;
    if (!members.has(row.memberId)) errors.push(`${label}: choose a current household member.`);
    if (!calendarDateSchema.safeParse(row.date).success) errors.push(`${label}: choose a valid date.`);
    else if (row.date < draft.prepareDate) errors.push(`${label}: the meal cannot be before preparation.`);
    if (!Number.isFinite(row.portions) || row.portions <= 0 || row.portions > 1000) errors.push(`${label}: choose a portion amount greater than zero and no more than 1,000.`);
    else allocatedPortions += row.portions;
    const key = occasion(row);
    if (occupied.has(key)) errors.push(`${label}: this person's meal is already covered. Choose an open meal or reopen it in your plan.`);
    if (rows.has(key)) errors.push(`${label}: this person and meal appears twice. Combine the portions into one row.`);
    rows.add(key);
    if (allocationIds.has(row.id)) errors.push(`${label}: this allocation already exists. Remove it and add a new row.`);
    allocationIds.add(row.id);
  });
  if (allocatedPortions > draft.totalPortions + 0.000001) errors.push("The allocated portions exceed your total. Increase the total or reduce an allocation.");
  if (errors.length) return { ok: false, errors };

  const reservedPortions = Math.max(0, draft.totalPortions - allocatedPortions);
  const parsed = pilotChangeSchema.safeParse({
    type: "create_batch",
    batch: { id: batchId, recipe, prepareDate: draft.prepareDate, yield: draft.totalPortions, reservedExtra: reservedPortions },
    allocations: draft.allocations.map((row) => ({ ...row, batchId })),
  });
  if (!parsed.success || parsed.data.type !== "create_batch") return { ok: false, errors: ["Check the recipe, meal choices and portions before planning this batch."] };
  return { ok: true, operation: parsed.data, allocatedPortions, reservedPortions };
}
