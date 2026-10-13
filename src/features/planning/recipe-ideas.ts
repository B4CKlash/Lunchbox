import type { HouseholdState, Recipe, RecommendationContext } from "@/lib/contracts";
import { ingredientCatalog, normalizeIngredientName } from "@/features/pantry/ingredients";
import { demoRecipeIdeas } from "@/features/meals/demo-provider";
import { planningFixtureRecipe } from "@/features/meals/planning-fixtures";
import { buildRecommendationContext } from "@/features/meals/recommendation-context";
import { recipeFitsRecommendationContext } from "@/features/meals/recommendation-constraints";
import { previewCandidateShopping } from "./candidate-shopping";

/** Recheck stored snapshots and starter examples against current constraints.
 * Matching declared ingredients is a conservative exclusion, not an allergen
 * safety check or a claim about ingredients hidden inside other products.
 */
export function recipeFitsIdeaContext(recipe: Recipe, context: RecommendationContext): boolean {
  if (recipe.minutes > context.preferences.maxMinutes || !recipeFitsRecommendationContext(recipe, context)) return false;
  const exclusions = (context.preferences.allergies ?? []).map((name) => normalizeIngredientName(name).replaceAll("-", " "));
  return !recipe.ingredients.some((ingredient) => {
    const canonical = ingredientCatalog.find((entry) => entry.ingredientId === ingredient.ingredientId);
    const names = [ingredient.ingredientId, ingredient.name, ...(canonical ? [canonical.name, ...canonical.aliases] : [])]
      .map((name) => normalizeIngredientName(name).replaceAll("-", " "));
    return exclusions.some((excluded) => excluded.length > 0 && names.some((name) => name.includes(excluded)));
  });
}

export function recipeIdeaFit(state: HouseholdState, recipe: Recipe) {
  const portions = state.preferences.servings;
  const preview = previewCandidateShopping(state, recipe, portions, state.pilot!.session.startDate);
  return { portions, shortages: preview.shortages.length, checks: preview.checks.length,
    ready: !preview.shortages.length && !preview.checks.length };
}

/** Keep labeled starter options available while actual snapshots accumulate.
 * Current dislikes, declared ingredient exclusions, equipment and time filter
 * cards; existing stock commitments determine their displayed pantry fit. */
export function buildRecipeIdeas(state: HouseholdState, actorId?: string): Recipe[] {
  const context = buildRecommendationContext(state, actorId);
  const actual = [
    ...(state.pilot?.session.candidates ?? []).slice().reverse(),
    ...state.workspace.recipeBox.map(({ recipe, source }) => ({ ...recipe, provenance: recipe.provenance ?? { source } })),
    ...state.workspace.suggestions.blocks.flatMap((block) => block.recipes),
  ];
  const examples = [
    ...demoRecipeIdeas(),
    ...(["vegetables", "pasta", "quick", "cuisine"] as const).map((variation) => planningFixtureRecipe(state, variation)),
  ];
  const unique = new Map<string, Recipe>();
  for (const recipe of [...actual, ...examples]) if (!unique.has(recipe.id) && recipeFitsIdeaContext(recipe, context)) unique.set(recipe.id, recipe);
  return [...unique.values()].map((recipe, index) => ({ recipe, index, fit: recipeIdeaFit(state, recipe) }))
    .sort((a, b) => Number(b.fit.ready) - Number(a.fit.ready)
      || a.fit.shortages - b.fit.shortages || a.fit.checks - b.fit.checks || a.index - b.index)
    .slice(0, 10).map(({ recipe }) => recipe);
}
