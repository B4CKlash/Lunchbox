import type { PantryCategory, ProfileFoodTarget, RecommendationContext, Recipe } from "@/lib/contracts";
import { ingredientCatalog, normalizeIngredientName } from "@/features/pantry/ingredients";

export type RecommendationConstraintContext = Pick<RecommendationContext,
  "profileFacts" | "audienceIds" | "members" | "preferences" | "equipment" | "pantry" | "rejectedRecipeIds">
  & Partial<Pick<RecommendationContext, "feedback">>;

// These are authored food classifications, not guesses from recipe names.
const ingredientCategories: Record<string, PantryCategory> = {
  tomatoes: "vegetables", onion: "vegetables", zucchini: "vegetables", pepper: "vegetables", spinach: "vegetables",
  garlic: "vegetables", carrot: "vegetables", potato: "vegetables", broccoli: "vegetables", mushrooms: "vegetables",
  "tomato-sauce": "vegetables", "tomato-paste": "vegetables", "canned-tomatoes": "vegetables",
  lemon: "fruit", "lemon-juice": "fruit", banana: "fruit", apple: "fruit",
  rice: "carbs", "cooked-rice": "carbs", pasta: "carbs", "lasagna-sheets": "carbs", flour: "carbs", "rolled-oats": "carbs", sugar: "carbs",
  lentils: "protein", "dry-lentils": "protein", beans: "protein", "canned-chickpeas": "protein", "dry-chickpeas": "protein",
  "chicken-breast": "protein", "cooked-chicken": "protein", "ground-beef": "protein", tofu: "protein", eggs: "protein",
  milk: "dairy", butter: "dairy", mozzarella: "dairy", parmesan: "dairy", ricotta: "dairy", cheddar: "dairy", yogurt: "dairy",
  oil: "fats",
};
const categoryAliases: Record<string, PantryCategory> = {
  vegetable: "vegetables", vegetables: "vegetables", veggies: "vegetables", fruit: "fruit", fruits: "fruit",
  dairy: "dairy", carbs: "carbs", carbohydrates: "carbs", fats: "fats", protein: "protein",
};

function targetForText(text: string): ProfileFoodTarget {
  const normalized = normalizeIngredientName(text);
  const category = categoryAliases[normalized];
  if (category) return { kind: "category", category };
  const matches = ingredientCatalog.filter((item) => [item.ingredientId.replaceAll("-", " "), item.name, ...item.aliases]
    .some((name) => normalizeIngredientName(name) === normalized));
  if (matches.length === 1) return { kind: "ingredient", ingredientId: matches[0].ingredientId, name: matches[0].name };
  return { kind: "text", text: normalized };
}

function targetKey(target: ProfileFoodTarget): string {
  if (target.kind === "text") return targetKeyForText(target.text);
  return `${target.kind}:${target.kind === "ingredient" ? target.ingredientId : target.category}`;
}

function targetKeyForText(text: string) {
  const target = targetForText(text);
  return target.kind === "text" ? `text:${normalizeIngredientName(text)}` : targetKey(target);
}

function matchesTarget(ingredient: Recipe["ingredients"][number], target: ProfileFoodTarget, context: RecommendationConstraintContext): boolean {
  if (target.kind === "ingredient") return ingredient.ingredientId === target.ingredientId;
  if (target.kind === "category") {
    const category = context.pantry.find((item) => item.id === ingredient.ingredientId)?.category ?? ingredientCategories[ingredient.ingredientId];
    return category === target.category;
  }
  const resolved = targetForText(target.text);
  if (resolved.kind !== "text") return matchesTarget(ingredient, resolved, context);
  const wording = normalizeIngredientName(target.text);
  return wording.length > 0 && [ingredient.ingredientId.replaceAll("-", " "), ingredient.name]
    .some((name) => normalizeIngredientName(name) === wording);
}

function legacyMemberDislikes(preferences: string | undefined): ProfileFoodTarget[] {
  return (preferences ?? "").split(/[.;\n]/).flatMap((clause) => {
    const match = /^(?:(?:i|we)\s+)?(?:no|dislikes?|hate|don't like|do not like)\s+(.+)$/i.exec(clause.trim());
    if (!match || /\b(?:but|because|except|if|when|tonight|today)\b/i.test(match[1])) return [];
    return match[1].split(/,\s*|\s+and\s+/i).map(targetForText);
  });
}

/** Eligibility only: neither recommendations nor current-turn overrides save household data. */
export function recipeFitsRecommendationContext(recipe: Recipe, context?: RecommendationConstraintContext): boolean {
  if (!context) return true;
  if (context.rejectedRecipeIds.includes(recipe.id)) return false;
  const facts = context.profileFacts.filter((fact) => fact.kind === "food-dislike"
    && (fact.scope.kind === "household" || context.audienceIds.includes(fact.scope.memberId)));
  if (facts.some((fact) => fact.kind === "food-dislike" && fact.disliked
    && recipe.ingredients.some((ingredient) => matchesTarget(ingredient, fact.target, context)))) return false;

  const legacy = [
    ...(context.preferences.dislikedIngredients ?? []).map((text) => ({ memberId: undefined, target: targetForText(text) })),
    ...context.members.filter((member) => context.audienceIds.includes(member.id)).flatMap((member) =>
      legacyMemberDislikes(member.preferences).map((target) => ({ memberId: member.id, target }))),
  ];
  for (const entry of legacy) {
    // An explicit correction replaces only the same person's/household's older claim.
    const corrected = facts.some((fact) => fact.kind === "food-dislike"
      && (entry.memberId ? fact.scope.kind === "member" && fact.scope.memberId === entry.memberId : fact.scope.kind === "household")
      && targetKey(fact.target) === targetKey(entry.target));
    if (!corrected && recipe.ingredients.some((ingredient) => matchesTarget(ingredient, entry.target, context))) return false;
  }

  const instructions = recipe.steps.join(" ");
  const needsOven = /\b(?:oven|bak(?:e|es|ed|ing)|roast(?:s|ed|ing)?)\b/i.test(instructions);
  if (needsOven && context.profileFacts.some((fact) => fact.kind === "equipment"
    && normalizeIngredientName(fact.equipment) === "oven" && fact.availability === "unavailable")) return false;
  const personalFeedback = (context.feedback ?? []).filter((entry) => entry.recipeId === recipe.id && entry.memberId && context.audienceIds.includes(entry.memberId));
  const relevantFeedback = personalFeedback.length ? personalFeedback : (context.feedback ?? []).filter((entry) => entry.recipeId === recipe.id && !entry.memberId);
  return !relevantFeedback.length || relevantFeedback.some((entry) => entry.makeAgain);
}
