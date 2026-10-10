import {
  chatMealsRequestSchema,
  chatMealsResponseSchema,
  type ChatMealsRequest,
  type ChatMealsResponse,
  type Recipe,
  type PlannedMeal,
  type ShoppingItem,
} from "@/lib/contracts";
import { buildShoppingList } from "@/features/planning/shopping";
import { buildPilotShoppingList, type PilotStockCheck } from "@/features/planning/pilot";
import { suggestMeals } from "./demo-provider";
import { householdFromRecommendationContext, recommendationContextForMessage, resolveRecommendationContext } from "./recommendation-context";

const normalize = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[?.!]+$/g, "")
    .replace(/\s+/g, " ");
const amount = (quantity: number, unit: string) =>
  `${quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${unit}`;

function shortageSummary(items: ShoppingItem[]) {
  const visible = items.slice(0, 8);
  const list = visible
    .map((item) => `${amount(item.quantity, item.unit)} ${item.name}${item.restock ? " (staple restock)" : ""}`)
    .join("; ");
  return `${list}${items.length > visible.length ? `; plus ${items.length - visible.length} more ingredients` : ""}`;
}

function stockCheckSummary(checks: PilotStockCheck[]) {
  const unresolved = checks.filter((check) => !check.resolved);
  const names = unresolved.slice(0, 8).map((check) => check.name).join(", ");
  return unresolved.length ? ` Check the current amount of ${names}${unresolved.length > 8 ? ", and other ingredients" : ""} before buying or cooking; the available quantity is unknown.` : "";
}

const fallbackReply =
  "This is a demo recipe guide. I can suggest sample meals, find a quicker option, use your use-soon ingredients, review your calendar preview, or explain a selected recipe. Try “recipes with rice” to search the samples. I can’t apply cuisine, dietary, allergy, substitution, or custom serving instructions in chat yet; I haven’t applied those constraints. Set servings and time in the controls, or choose one of the prompts.";

/** Bounded demo commands only: recipe proposals never mutate the household. */
export async function chatAboutMeals(
  input: ChatMealsRequest,
): Promise<ChatMealsResponse> {
  const request = chatMealsRequestSchema.parse(input);
  const originalContext = resolveRecommendationContext(request);
  const context = recommendationContextForMessage(originalContext, request.message);
  let requestOnlyPreference = false;
  const command = request.message.split(/(?<=[.!?])\s+|\n+|;\s*/).filter((clause) => {
    if (!originalContext) return true;
    const updated = recommendationContextForMessage(originalContext, clause);
    const changed = JSON.stringify(updated?.profileFacts) !== JSON.stringify(originalContext.profileFacts);
    if (changed) requestOnlyPreference = true;
    return !changed;
  }).join(" ");
  const message = normalize(command || (requestOnlyPreference ? "suggest meals" : request.message)).replace(/^please /, "");
  const { focusedRecipe } = request;
  const preferences = context?.preferences ?? request.preferences;
  const pantry = context?.pantry ?? request.pantry;
  const focusedServings = request.focusedServings ?? preferences.servings;
  function stockPreview(meals: PlannedMeal[], includeRestock = true) {
    if (!context) return { shortages: buildShoppingList(request.pantry, meals, { includeRestock }), checks: [] as PilotStockCheck[] };
    const state = householdFromRecommendationContext(context);
    state.pilot.batches = meals.map((meal, index) => ({
      id: `demo-preview-${index}`, recipe: meal.recipe, yield: meal.servings,
      prepareDate: state.pilot.shopThrough, reservedExtra: 0, status: "planned" as const,
    }));
    const preview = buildPilotShoppingList(state);
    if (includeRestock) {
      const restocks = buildShoppingList(pantry.map((item) => ({ ...item, quantity: item.quantity ?? 0 })), [], { includeRestock: true });
      const uncertain = new Set(preview.checks.map((check) => JSON.stringify([check.ingredientId, check.unit])));
      for (const restock of restocks) {
        const key = JSON.stringify([restock.ingredientId, restock.unit]);
        if (uncertain.has(key) || pantry.some((item) => item.id === restock.ingredientId && item.unit === restock.unit && item.quantity === undefined)) continue;
        const existing = preview.shortages.find((item) => item.ingredientId === restock.ingredientId && item.unit === restock.unit);
        if (existing) { existing.quantity = Math.max(existing.quantity, restock.quantity); existing.restock = true; }
        else preview.shortages.push(restock);
      }
    }
    return preview;
  }
  function response(
    reply: string,
    recipes: Recipe[] = [],
    servings = preferences.servings,
  ): ChatMealsResponse {
    return chatMealsResponseSchema.parse({
      source: "demo",
      reply,
      recipes,
      servings,
    });
  }

  if (/^(review|show|check)( me)? my (meal )?plan$/.test(message)) {
    if (!request.meals.length)
      return response(
        "Your calendar is empty. Ask what you can make tonight, then use Add to calendar on a recipe. Place your meals and commit your calendar to update the grocery list. Planning keeps your pantry quantities unchanged.",
      );
    const { shortages, checks } = stockPreview(request.meals);
    const names = request.meals
      .slice(0, 5)
      .map((meal) => `${meal.recipe.name} (${meal.servings} servings)`)
      .join("; ");
    return response(
      `Your calendar preview has ${request.meals.length} ${request.meals.length === 1 ? "meal" : "meals"}: ${names}${request.meals.length > 5 ? "; and more" : ""}. ${shortages.length ? `After combining these meals and counting pantry stock once, this preview needs: ${shortageSummary(shortages)}.` : checks.some((check) => !check.resolved) ? "The measured stock covers the other combined ingredients in this preview." : "Your pantry covers the combined ingredient amounts in this preview."}${stockCheckSummary(checks)} Commit your calendar to update the grocery list with all missing ingredient amounts for these meals. Planning has not changed your pantry quantities.`,
    );
  }

  const wantsIngredients =
    /^(what do i need( for (this|the) recipe)?|what (ingredients|am i missing)( for (this|the) recipe)?|show( me)? (the )?ingredients|ingredients)$/.test(
      message,
    );
  const wantsSteps =
    /^(how do i (make|cook) (this|it|this recipe)|show( me)? (the )?(cooking )?steps|steps|how (is|do i prepare) (this|this recipe))$/.test(
      message,
    );
  const wantsOverview =
    /^(tell me about|explain|discuss) (this|this recipe)$/.test(message);

  if (wantsIngredients || wantsSteps || wantsOverview) {
    if (!focusedRecipe)
      return response(
        "Choose Discuss on a recipe first so I know which meal you mean. Then I can show its ingredients, pantry gaps, or cooking steps.",
      );
    if (wantsSteps) {
      const steps = focusedRecipe.steps
        .slice(0, 3)
        .map(
          (step, index) =>
            `${index + 1}. ${step.length > 220 ? `${step.slice(0, 217)}…` : step}`,
        )
        .join("\n");
      return response(
        `Here is the cooking guide for ${focusedRecipe.name}:\n${steps}\nOpen Ingredients & steps on the recipe for the complete instructions. Ingredient quantities on the card are scaled to ${focusedServings} servings.`,
        [focusedRecipe],
        focusedServings,
      );
    }
    const { shortages, checks } = stockPreview([
      {
        id: "recipe-preview",
        recipe: focusedRecipe,
        servings: focusedServings,
      },
    ], false);
    return response(
      `${focusedRecipe.name} takes ${focusedRecipe.minutes} minutes. For ${focusedServings} servings, ${shortages.length ? `you need to pick up: ${shortageSummary(shortages)}.` : checks.some((check) => !check.resolved) ? "the measured stock covers the other ingredients." : "your pantry covers all the ingredient amounts."}${stockCheckSummary(checks)} This checks this recipe on its own; your shopping list combines only committed meals plus low staple restocks. Commit calendar changes to update your grocery list. Open Ingredients & steps for the complete recipe.`,
      [focusedRecipe],
      focusedServings,
    );
  }

  const wantsSoon =
    /^(use( my)? (use-soon|use soon) ingredients|what can i (make|cook) with( my)? (use-soon|use soon) ingredients)$/.test(
      message,
    );
  const wantsQuicker =
    /^(find( me)? a (quicker|faster|quick) (meal|option)|something (quicker|faster)|what is (quicker|faster))$/.test(
      message,
    );
  const wantsIdeas =
    /^(what can i (make|cook)( (tonight|today|for dinner|with my pantry|with what i have))?|suggest( some| a few| me)? (meals|recipes)|give me (some )?(meal ideas|recipes)|meal ideas)$/.test(
      message,
    );
  const ingredientQuery = message.match(
    /^(?:recipes? (?:with|using)|use|i have) (.+)$/,
  )?.[1];

  if (!wantsSoon && !wantsQuicker && !wantsIdeas && !ingredientQuery)
    return response(fallbackReply);

  // Recognize the entire ingredient phrase; do not drop extra user constraints.
  let ingredientId: string | undefined;
  if (ingredientQuery && !wantsSoon) {
    const catalog = await suggestMeals({
      pantry: request.pantry,
      preferences: { ...preferences, maxMinutes: 120 },
      recommendationContext: context ? { ...context, preferences: { ...preferences, maxMinutes: 120 } } : undefined,
    });
    if (!catalog.recipes.length && context) return response("No sample recipes fit the current food preferences or kitchen equipment. Change the request or use Local AI to explore another recipe.");
    ingredientId = catalog.recipes
      .flatMap((recipe) => recipe.ingredients)
      .find((ingredient) =>
        [ingredient.ingredientId.replaceAll("-", " "), ingredient.name].some(
          (name) => normalize(name) === ingredientQuery,
        ),
      )?.ingredientId;
    if (!ingredientId) return response(fallbackReply);
  }

  const suggestions = await suggestMeals({
    pantry: request.pantry,
    recommendationContext: context ? { ...context, preferences: { ...preferences, prioritizeUseSoon: wantsSoon || preferences.prioritizeUseSoon } } : undefined,
    preferences: {
      ...preferences,
      prioritizeUseSoon: wantsSoon || preferences.prioritizeUseSoon,
    },
  });
  let recipes = suggestions.recipes;
  if (ingredientId)
    recipes = recipes.filter((recipe) =>
      recipe.ingredients.some(
        (ingredient) => ingredient.ingredientId === ingredientId,
      ),
    );
  if (wantsSoon)
    recipes = recipes.filter((recipe) =>
      recipe.ingredients.some((ingredient) =>
        pantry.some(
          (item) =>
            item.id === ingredient.ingredientId &&
            item.unit === ingredient.unit &&
            (item.quantity ?? 0) > 0 &&
            item.useSoon,
        ),
      ),
    );
  if (wantsQuicker) {
    const threshold = focusedRecipe?.minutes ?? preferences.maxMinutes;
    recipes = recipes
      .filter((recipe) => recipe.minutes < threshold)
      .sort((a, b) => a.minutes - b.minutes);
    if (!recipes.length)
      return response(
        `None of the sample recipes is quicker than ${threshold} minutes within your time limit. You can browse the other suggestions or adjust the time available.`,
      );
  }
  if (!recipes.length)
    return response(
      wantsSoon
        ? "No sample recipes within your time limit use an ingredient currently marked use-soon with matching stock and units. Try more time or check the use-soon flags in your pantry."
        : "No sample recipes match this request within your time limit. Try more time in the controls or browse the other sample suggestions.",
    );

  return response(
    `${requestOnlyPreference ? "I applied your stated preference for this answer. " : ""}Here ${recipes.length === 1 ? "is a sample meal" : "are sample meals"} ${wantsSoon ? "using your available use-soon ingredients" : wantsQuicker ? "that take less time" : ingredientId ? `with ${ingredientQuery}` : "matched to your pantry"}, for ${preferences.servings} servings and up to ${preferences.maxMinutes} minutes. These are demo suggestions. Save a recipe, discuss it, or add it to your calendar draft. Arrange your meals, then commit your calendar to update the grocery list.`,
    recipes,
  );
}
