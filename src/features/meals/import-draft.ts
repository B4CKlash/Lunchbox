import {
  recipeDraftSchema,
  recipeProvenanceSchema,
  recipeSchema,
  type KnownIngredient,
  type Recipe,
  type RecipeDraft,
  type RecipeProvenance,
  type Unit,
} from "@/lib/contracts";
import { resolveIngredient } from "@/features/pantry/ingredients";

export class ImportDraftError extends Error {
  constructor(readonly issues: Array<{ path: string; message: string }>) {
    super(issues.slice(0, 3).map((issue) => issue.message).join(" "));
    this.name = "ImportDraftError";
  }
}

/** Only explicit supported units and unambiguous whole-item counts are accepted. */
export function parseImportedAmount(originalLine: string): { quantity: number | null; unit: Unit | null } {
  const unresolved = { quantity: null, unit: null };
  const line = originalLine.trim().replace(/^[-*•]\s*/, "");
  if (/\b(?:to taste|as needed|approximately|approx\.?|about|around|roughly|plus (?:more|extra)|or (?:more|less))\b/i.test(line) ||
      /(?:\d|[¼½¾])\s*(?:g|grams?|ml|millilit(?:er|re)s?|each)?\s*(?:[-–—]|\bto\b)\s*(?:\d|[¼½¾])/i.test(line)) return unresolved;
  const match = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[¼½¾])\s*(.*)$/.exec(line);
  if (!match) return unresolved;
  const token = match[1];
  const amount = token === "¼" ? .25 : token === "½" ? .5 : token === "¾" ? .75
    : token.includes("/") ? token.split(/\s+/).reduce((sum, part) => {
      const fraction = part.split("/");
      return sum + (fraction.length === 2 ? Number(fraction[0]) / Number(fraction[1]) : Number(part));
    }, 0) : Number(token);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return unresolved;
  const rest = match[2].trim();
  if (/^(?:[-–—]|to\b)/i.test(rest)) return unresolved;
  if (/^(?:g|grams?)\b\.?\s*/i.test(rest)) return { quantity: amount, unit: "g" };
  if (/^(?:ml|millilit(?:er|re)s?)\b\.?\s*/i.test(rest)) return { quantity: amount, unit: "ml" };
  if (/^each\b/i.test(rest)) return { quantity: amount, unit: "each" };
  // These nouns denote individual items, never cans/bunches/cups or garlic heads/cloves.
  if (/^(?:(?:small|medium|large|whole|yellow|red|green|fresh)\s+)*(?:eggs?|onions?|lemons?|limes?|tomatoes|tomato|bell peppers?|sweet peppers?|zucchini|courgettes?|apples?|bananas?|potatoes?|carrots?)\b/i.test(rest))
    return { quantity: amount, unit: "each" };
  return unresolved;
}

/** Client-safe: called only when a person saves the corrected review form. */
export function finalizeImportDraft(
  draft: RecipeDraft,
  provenance: RecipeProvenance,
  known: KnownIngredient[] = [],
): Recipe {
  const validation = recipeDraftSchema.safeParse(draft);
  if (!validation.success) throw new ImportDraftError(validation.error.issues.map((issue) => ({
    path: issue.path.join("."), message: `Check ${issue.path.join(" ")}: ${issue.message}`,
  })));
  const issues: Array<{ path: string; message: string }> = [];
  if (!draft.name.trim()) issues.push({ path: "name", message: "Give the recipe a name." });
  if (!draft.servings) issues.push({ path: "servings", message: "Enter the original recipe's base servings (1–12)." });
  if (!draft.minutes) issues.push({ path: "minutes", message: "Enter its total cooking time (1–240 minutes)." });
  if (!draft.steps.length) issues.push({ path: "steps", message: "Add at least one cooking instruction." });
  const ingredients = draft.ingredients.map((item, index) => {
    const label = item.name.trim() || `Ingredient ${index + 1}`;
    if (!item.name.trim() || item.quantity === null || item.unit === null) {
      issues.push({ path: `ingredients.${index}`, message: `Review ${label}: a name, amount, and g, ml, or each are required.` });
      return null;
    }
    const resolution = resolveIngredient({ ...item, unit: item.unit }, known);
    if (resolution.status === "ambiguous") {
      issues.push({ path: `ingredients.${index}.ingredientId`, message: `Choose which pantry ingredient matches ${label}.` });
      return null;
    }
    return { ...resolution.ingredient, quantity: item.quantity };
  });
  if (issues.length) throw new ImportDraftError(issues);
  const result = recipeSchema.safeParse({
    id: `import-${crypto.randomUUID()}`,
    name: draft.name.trim(),
    description: draft.description,
    servings: draft.servings,
    minutes: draft.minutes,
    ingredients,
    steps: draft.steps,
    provenance: recipeProvenanceSchema.parse({ ...provenance, source: "import" }),
  });
  if (!result.success) throw new ImportDraftError(result.error.issues.map((issue) => ({
    path: issue.path.join("."), message: `Check ${issue.path.join(" ")}: ${issue.message}`,
  })));
  return result.data;
}
