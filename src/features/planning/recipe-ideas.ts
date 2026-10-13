import type { HouseholdState, Recipe } from "@/lib/contracts";
import { demoRecipeIdeas } from "@/features/meals/demo-provider";
import { planningFixtureRecipe } from "@/features/meals/planning-fixtures";
import { buildRecommendationContext } from "@/features/meals/recommendation-context";
import { recipeFitsRecommendationContext } from "@/features/meals/recommendation-constraints";
import { previewCandidateShopping } from "./candidate-shopping";

export function recipeIdeaFit(state: HouseholdState, recipe: Recipe) {
  const portions = state.preferences.servings;
  const preview = previewCandidateShopping(state, recipe, portions, state.pilot!.session.startDate);
  return { portions, shortages: preview.shortages.length, checks: preview.checks.length,
    ready: !preview.shortages.length && !preview.checks.length };
}

/** Keep labeled starter options available while actual snapshots accumulate.
 * Every card respects current context and existing stock commitments. */
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
  for (const recipe of [...actual, ...examples]) if (!unique.has(recipe.id) && recipeFitsRecommendationContext(recipe, context)) unique.set(recipe.id, recipe);
  return [...unique.values()].map((recipe, index) => ({ recipe, index, fit: recipeIdeaFit(state, recipe) }))
    .sort((a, b) => Number(b.fit.ready) - Number(a.fit.ready)
      || a.fit.shortages - b.fit.shortages || a.fit.checks - b.fit.checks || a.index - b.index)
    .slice(0, 10).map(({ recipe }) => recipe);
}
