import type { HouseholdState } from "@/lib/contracts";
import { knownIngredientsFromHousehold, resolveIngredient } from "./ingredients";
import type { NaturalStockEntryDraft } from "./natural-stock-entry";

/** Keep the stock that was visible when review began, across remote refreshes. */
export function captureNaturalStockReview(state: HouseholdState) {
  return {
    pantry: state.pantry.map(({ id, unit, quantity }) => ({ id, unit, quantity })),
    stock: (state.pilot?.stock ?? []).map(({ ingredientId, unit, status, quantity }) => ({ ingredientId, unit, status, quantity })),
    packages: (state.pilot?.packageStock ?? []).map(({ ingredientId, packageKind, status, count }) => ({ ingredientId, packageKind, status, count })),
    packagePurchases: (state.pilot?.packagePurchases ?? []).map(({ id, ingredientId, packageKind }) => ({ id, ingredientId, packageKind })),
    known: knownIngredientsFromHousehold(state),
  };
}

export type NaturalStockReview = ReturnType<typeof captureNaturalStockReview>;

function targetBasis(review: NaturalStockReview, draft: NaturalStockEntryDraft) {
  const identity = resolveIngredient({ name: draft.name, unit: draft.unit ?? "each" }, review.known);
  const identityIds = identity.status === "resolved" ? [identity.ingredient.ingredientId] : identity.candidates.map((entry) => entry.ingredientId).sort();
  const selectedNames = [...new Set(review.known.filter((entry) => entry.ingredientId === draft.ingredientId).map((entry) => entry.name))].sort();
  if (draft.packageKind) return JSON.stringify({ identityIds, selectedNames,
    stock: review.packages.filter((entry) => entry.ingredientId === draft.ingredientId && entry.packageKind === draft.packageKind),
    purchases: review.packagePurchases.filter((entry) => entry.ingredientId === draft.ingredientId && entry.packageKind === draft.packageKind).map((entry) => entry.id).sort(),
  });
  return JSON.stringify({ identityIds, selectedNames,
    quantity: review.pantry.filter((entry) => entry.id === draft.ingredientId && entry.unit === draft.unit).reduce((sum, entry) => sum + entry.quantity, 0),
    stock: review.stock.filter((entry) => entry.ingredientId === draft.ingredientId && entry.unit === draft.unit),
  });
}

/** Additions can use a newer balance; an old absolute total cannot replace it. */
export function assertNaturalStockReviewCurrent(review: NaturalStockReview | null, state: HouseholdState, draft: NaturalStockEntryDraft) {
  if (draft.operation !== "set_total" || !draft.ingredientId) return;
  if (!review || targetBasis(review, draft) !== targetBasis(captureNaturalStockReview(state), draft)) {
    throw new Error("Stock or ingredient identity changed while this review was open. Review the statement again before replacing the total.");
  }
}
