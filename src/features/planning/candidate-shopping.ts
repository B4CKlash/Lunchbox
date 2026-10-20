import { calendarDateSchema, recipeSchema, type HouseholdState, type Recipe, type ShoppingItem } from "@/lib/contracts";
import { buildPilotShoppingList, ensurePilot, ingredientSufficiency, type PilotStockCheck } from "./pilot";

type CandidateShortage = Pick<ShoppingItem, "ingredientId" | "name" | "unit" | "quantity">;
export type CandidateShoppingPreview = {
  shopThrough: string;
  extendsShoppingHorizon: boolean;
  /** Additional purchases caused by the candidate, beyond existing demand. */
  shortages: CandidateShortage[];
  /** Required is combined demand; candidateRequired is this batch's contribution. */
  checks: Array<Omit<CandidateShortage, "quantity"> & {
    required: number; candidateRequired: number;
    packageAvailability?: Pick<PilotStockCheck, "knownAvailable" | "knownRemainder" | "packageStock">;
  }>;
};
const keyFor = (ingredientId: string, unit: string) => JSON.stringify([ingredientId, unit]);
const round = (quantity: number) => Math.round((quantity + Number.EPSILON) * 1000) / 1000;

export type UnscheduledShoppingCandidate = { recipe: Recipe; portions: number };
type CombinedCandidateRequirement = Pick<ShoppingItem, "ingredientId" | "name" | "unit" | "required"> & {
  candidateRequired: number;
  existingRequired: number;
  knownAvailable: number;
  /** False for qualitative stock; knownAvailable is then not an exact balance. */
  quantityKnown: boolean;
};
export type CombinedCandidateShoppingPreview = {
  /** Existing commitments are scoped to this saved date; no date is chosen for the candidates. */
  shopThrough: string;
  requirements: CombinedCandidateRequirement[];
  /** quantity is additional buying caused by the selection; totalQuantity includes existing demand. */
  shortages: Array<CandidateShortage & { totalQuantity: number }>;
  /** Unknown balances or package contents must be checked for the new combined demand. */
  checks: Array<Omit<CombinedCandidateRequirement, "quantityKnown"> & Pick<PilotStockCheck, "knownRemainder" | "packageStock">>;
};

/** Preview several unscheduled recipes together without spending the same stock twice.
 * Hypothetical batches exist only in this calculation, through the saved horizon.
 * They never schedule a meal, change that horizon, or reuse a saved stock confirmation.
 */
export function previewUnscheduledShopping(state: HouseholdState, candidates: readonly UnscheduledShoppingCandidate[]): CombinedCandidateShoppingPreview {
  const selected = candidates.map(({ recipe, portions }) => {
    if (!Number.isFinite(portions) || portions < 0 || portions > 1000) throw new RangeError("Choose a batch yield between zero and 1,000 portions.");
    return { recipe: recipeSchema.parse(recipe), portions };
  }).filter(({ portions }) => portions > 0);
  const current = ensurePilot(state);
  const preview: CombinedCandidateShoppingPreview = { shopThrough: current.pilot.shopThrough, requirements: [], shortages: [], checks: [] };
  if (!selected.length) return preview;

  const baseline = buildPilotShoppingList(current);
  const existingIds = new Set(current.pilot.batches.map((batch) => batch.id));
  const hypotheticalBatches = selected.map(({ recipe, portions }, index) => {
    let batchId = `unscheduled-shopping-preview-${index}`;
    for (let suffix = 1; existingIds.has(batchId); suffix++) batchId = `unscheduled-shopping-preview-${index}-${suffix}`;
    existingIds.add(batchId);
    return { id: batchId, recipe, prepareDate: preview.shopThrough, yield: portions, reservedExtra: portions, status: "planned" as const };
  });
  const hypothetical = buildPilotShoppingList({ ...current, pilot: { ...current.pilot, batches: [...current.pilot.batches, ...hypotheticalBatches] } });
  const baselineShortages = new Map(baseline.shortages.map((item) => [keyFor(item.ingredientId, item.unit), item.quantity]));
  const combinedShortages = new Map(hypothetical.shortages.map((item) => [keyFor(item.ingredientId, item.unit), item.quantity]));
  const combinedChecks = new Map(hypothetical.checks.map((check) => [keyFor(check.ingredientId, check.unit), check]));
  const existingRequirements = new Map<string, number>();
  for (const batch of baseline.batches) for (const ingredient of batch.recipe.ingredients) {
    const key = keyFor(ingredient.ingredientId, ingredient.unit);
    existingRequirements.set(key, (existingRequirements.get(key) ?? 0) + ingredient.quantity * batch.yield / batch.recipe.servings);
  }
  const contributions = new Map<string, Pick<ShoppingItem, "ingredientId" | "name" | "unit"> & { amount: number }>();
  for (const candidate of selected) for (const ingredient of candidate.recipe.ingredients) {
    const key = keyFor(ingredient.ingredientId, ingredient.unit);
    const contribution = contributions.get(key) ?? { ingredientId: ingredient.ingredientId, name: ingredient.name, unit: ingredient.unit, amount: 0 };
    contribution.amount += ingredient.quantity * candidate.portions / candidate.recipe.servings;
    contributions.set(key, contribution);
  }
  for (const [key, contribution] of contributions) {
    const { amount, ...ingredient } = contribution;
    const existingAmount = existingRequirements.get(key) ?? 0;
    const required = round(existingAmount + amount);
    const stock = ingredientSufficiency(current, { ...ingredient, required });
    const requirement = { ...ingredient, required, candidateRequired: round(amount), existingRequired: round(existingAmount), knownAvailable: stock.available, quantityKnown: !stock.uncertain };
    preview.requirements.push(requirement);
    const check = combinedChecks.get(key);
    if (check) {
      // A prior confirmation belongs to its original requirements and sources.
      // Always expose this selection as a fresh check, with no reusable authority.
      preview.checks.push({ ...ingredient, required, candidateRequired: requirement.candidateRequired, existingRequired: requirement.existingRequired,
        knownAvailable: check.knownAvailable, knownRemainder: check.knownRemainder, packageStock: check.packageStock });
    } else {
      const totalQuantity = combinedShortages.get(key) ?? 0;
      const quantity = round(Math.max(0, totalQuantity - (baselineShortages.get(key) ?? 0)));
      if (quantity > 0) preview.shortages.push({ ...ingredient, quantity, totalQuantity });
    }
  }
  return preview;
}

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
  const contributions = new Map<string, number>();
  for (const ingredient of candidate.ingredients) {
    const key = keyFor(ingredient.ingredientId, ingredient.unit);
    contributions.set(key, (contributions.get(key) ?? 0) + ingredient.quantity * portions / candidate.servings);
  }
  const relevant = new Set(contributions.keys());
  const baselineShortages = new Map(baseline.shortages.map((item) => [keyFor(item.ingredientId, item.unit), item.quantity]));
  for (const item of hypothetical.shortages) {
    const key = keyFor(item.ingredientId, item.unit);
    if (!relevant.has(key)) continue;
    const quantity = round(item.quantity - (baselineShortages.get(key) ?? 0));
    if (quantity > 0) preview.shortages.push({ ingredientId: item.ingredientId, name: item.name, unit: item.unit, quantity });
  }
  for (const check of hypothetical.checks) {
    const contribution = round(contributions.get(keyFor(check.ingredientId, check.unit)) ?? 0);
    if (contribution > 0) preview.checks.push({
      ingredientId: check.ingredientId, name: check.name, unit: check.unit,
      required: check.required, candidateRequired: contribution,
      ...(check.packageStock.length ? { packageAvailability: { knownAvailable: check.knownAvailable, knownRemainder: check.knownRemainder, packageStock: check.packageStock } } : {}),
    });
  }
  return preview;
}
