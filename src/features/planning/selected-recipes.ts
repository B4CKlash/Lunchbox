import type { HouseholdState, PilotChange, PilotOperation, Recipe } from "@/lib/contracts";
import type { UnscheduledShoppingCandidate } from "./candidate-shopping";
import { selectProposalChanges } from "./pilot";

export type SelectedRecipeDrafts = { shortlist: Recipe[]; portionDrafts?: Record<string, string> };

const batchesFromChanges = (changes: readonly PilotChange[]): UnscheduledShoppingCandidate[] => changes.flatMap((change) => change.type === "create_batch"
  ? [{ recipe: change.batch.recipe, portions: change.batch.yield }] : []);

/** Extract only batches that this operation will save, never unaccepted proposals. */
export function scheduledBatchesForOperation(state: HouseholdState, operation: PilotOperation): UnscheduledShoppingCandidate[] {
  if (operation.type === "create_batch") return batchesFromChanges([operation]);
  if (operation.type === "receive_planning_result") return operation.directPlacement ? batchesFromChanges([operation.directPlacement.change]) : [];
  if (operation.type !== "apply_proposal") return [];
  const proposal = state.pilot?.proposals.find((entry) => entry.id === operation.proposalId);
  if (!proposal || proposal.status !== "pending" || proposal.legacyMeals) return [];
  return batchesFromChanges(selectProposalChanges(proposal.changes, operation.selectedAllocationIds, operation.includeOtherChanges));
}

// Object key ordering is not a recipe edit; ingredient and instruction order is.
const recipeSnapshot = (recipe: Recipe) => JSON.stringify(recipe, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value);
const ownDraft = (selection: SelectedRecipeDrafts, recipeId: string) => selection.portionDrafts && Object.prototype.hasOwnProperty.call(selection.portionDrafts, recipeId)
  ? selection.portionDrafts[recipeId] : undefined;

/** Call only after a successful save. Newer recipe or form edits remain untouched.
 * Remove/re-keep generations are checked by the UI before supplying captured entries.
 */
export function reconcileScheduledSelections<T extends SelectedRecipeDrafts>(latest: T, captured: SelectedRecipeDrafts, scheduled: readonly UnscheduledShoppingCandidate[]): T {
  const totals = new Map<string, number>();
  for (const candidate of scheduled) {
    if (!Number.isFinite(candidate.portions) || candidate.portions <= 0) continue;
    const key = recipeSnapshot(candidate.recipe);
    totals.set(key, (totals.get(key) ?? 0) + candidate.portions);
  }
  if (!totals.size) return latest;
  const portionDrafts = { ...latest.portionDrafts };
  let changed = false;
  const shortlist = latest.shortlist.filter((recipe) => {
    const original = captured.shortlist.find((entry) => entry.id === recipe.id);
    const raw = ownDraft(latest, recipe.id);
    if (!original || raw === undefined || raw !== ownDraft(captured, recipe.id) || recipeSnapshot(original) !== recipeSnapshot(recipe)) return true;
    const total = Number(raw);
    if (!raw.trim() || !Number.isFinite(total) || total < 0.001 || total > 1000) return true;
    const consumed = totals.get(recipeSnapshot(recipe));
    if (!consumed) return true;
    changed = true;
    const remainder = total - consumed;
    // Addition/subtraction of decimal portions must not leave a phantom selection.
    const tolerance = Number.EPSILON * Math.max(total, consumed) * Math.max(1, scheduled.length);
    if (remainder <= tolerance) {
      delete portionDrafts[recipe.id];
      return false;
    }
    portionDrafts[recipe.id] = String(Number(remainder.toPrecision(15)));
    return true;
  });
  return changed ? { ...latest, shortlist, portionDrafts } : latest;
}
