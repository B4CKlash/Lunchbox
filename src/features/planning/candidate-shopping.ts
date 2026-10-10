import { calendarDateSchema, recipeSchema, type HouseholdState, type Recipe, type ShoppingItem } from "@/lib/contracts";
import { buildPilotShoppingList, ensurePilot } from "./pilot";

type CandidateShortage = Pick<ShoppingItem, "ingredientId" | "name" | "unit" | "quantity">;
export type CandidateShoppingPreview = {
  shopThrough: string;
  extendsShoppingHorizon: boolean;
  /** Additional purchases caused by the candidate, beyond existing demand. */
  shortages: CandidateShortage[];
  /** Required is combined demand; candidateRequired is this batch's contribution. */
  checks: Array<Omit<CandidateShortage, "quantity"> & { required: number; candidateRequired: number }>;
};
const keyFor = (ingredientId: string, unit: string) => JSON.stringify([ingredientId, unit]);
const round = (quantity: number) => Math.round((quantity + Number.EPSILON) * 1000) / 1000;

/** Compare the same shopping scope before/after a hypothetical batch. Nothing is saved. */
export function previewCandidateShopping(state: HouseholdState, recipe: Recipe, portions: number, prepareDate: string): CandidateShoppingPreview {
  if (!Number.isFinite(portions) || portions < 0 || portions > 1000) throw new RangeError("Choose a batch yield between zero and 1,000 portions.");
  const date = calendarDateSchema.parse(prepareDate);
  const candidate = recipeSchema.parse(recipe);
  // ensurePilot parses into a separate snapshot and keeps legacy migration pure.
  const current = ensurePilot(state, date);
  const shopThrough = current.pilot.shopThrough > date ? current.pilot.shopThrough : date;
  const preview: CandidateShoppingPreview = { shopThrough, extendsShoppingHorizon: shopThrough !== current.pilot.shopThrough, shortages: [], checks: [] };
  if (portions === 0) return preview;

  const existingIds = new Set(current.pilot.batches.map((batch) => batch.id));
  let batchId = "candidate-shopping-preview";
  for (let suffix = 1; existingIds.has(batchId); suffix++) batchId = `candidate-shopping-preview-${suffix}`;
  const batch = { id: batchId, recipe: candidate, prepareDate: date, yield: portions, reservedExtra: 0, status: "planned" as const };
  const scoped = { ...current, pilot: { ...current.pilot, shopThrough } };
  const baseline = buildPilotShoppingList(scoped);
  const hypothetical = buildPilotShoppingList({ ...scoped, pilot: { ...scoped.pilot, batches: [...scoped.pilot.batches, batch] } });
  const candidateChecks = buildPilotShoppingList({ ...scoped, pilot: { ...scoped.pilot, batches: [batch] } }).checks;
  const relevant = new Set(candidate.ingredients.map((ingredient) => keyFor(ingredient.ingredientId, ingredient.unit)));
  const baselineShortages = new Map(baseline.shortages.map((item) => [keyFor(item.ingredientId, item.unit), item.quantity]));
  for (const item of hypothetical.shortages) {
    const key = keyFor(item.ingredientId, item.unit);
    if (!relevant.has(key)) continue;
    const quantity = round(item.quantity - (baselineShortages.get(key) ?? 0));
    if (quantity > 0) preview.shortages.push({ ingredientId: item.ingredientId, name: item.name, unit: item.unit, quantity });
  }
  for (const check of hypothetical.checks) {
    const contribution = candidateChecks.find((candidateCheck) => keyFor(candidateCheck.ingredientId, candidateCheck.unit) === keyFor(check.ingredientId, check.unit));
    if (contribution && contribution.required > 0) preview.checks.push({
      ingredientId: check.ingredientId, name: check.name, unit: check.unit,
      required: check.required, candidateRequired: contribution.required,
    });
  }
  return preview;
}
