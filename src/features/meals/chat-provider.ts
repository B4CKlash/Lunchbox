import {
  chatMealsRequestSchema,
  chatMealsResponseSchema,
  type ChatMealsRequest,
  type ChatMealsResponse,
  type Recipe,
  type ShoppingItem,
} from "@/lib/contracts";
import { buildShoppingList } from "@/features/planning/shopping";
import { suggestMeals } from "./demo-provider";

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
    .map((item) => `${amount(item.quantity, item.unit)} ${item.name}`)
    .join("; ");
  return `${list}${items.length > visible.length ? `; plus ${items.length - visible.length} more ingredients` : ""}`;
}

const fallbackReply =
  "This is a demo recipe guide. I can suggest sample meals, find a quicker option, use your use-soon ingredients, review your plan, or explain a selected recipe. Try “recipes with rice” to search the samples. I can’t apply cuisine, dietary, allergy, substitution, or custom serving instructions in chat yet; I haven’t applied those constraints. Set servings and time in the controls, or choose one of the prompts.";

/** Bounded demo commands only: recipe proposals never mutate the household. */
export async function chatAboutMeals(
  input: ChatMealsRequest,
): Promise<ChatMealsResponse> {
  const request = chatMealsRequestSchema.parse(input);
  const message = normalize(request.message).replace(/^please /, "");
  const { pantry, preferences, focusedRecipe } = request;
  const focusedServings = request.focusedServings ?? preferences.servings;
  function response(
    reply: string,
    recipes: Recipe[] = [],
    servings = preferences.servings,
  ): ChatMealsResponse {
    return chatMealsResponseSchema.parse({ source: "demo", reply, recipes, servings });
  }

  if (/^(review|show|check)( me)? my (meal )?plan$/.test(message)) {
    if (!request.meals.length)
      return response(
        "Your plan is empty. Ask what you can make tonight, then use Add to plan on a recipe. Planning keeps your pantry quantities unchanged.",
      );
    const shortages = buildShoppingList(pantry, request.meals);
    const names = request.meals
      .slice(0, 5)
      .map((meal) => `${meal.recipe.name} (${meal.servings} servings)`)
      .join("; ");
    return response(
      `Your plan has ${request.meals.length} ${request.meals.length === 1 ? "meal" : "meals"}: ${names}${request.meals.length > 5 ? "; and more" : ""}. ${shortages.length ? `After combining the whole plan and counting pantry stock once, you need: ${shortageSummary(shortages)}. See the shopping list for every amount.` : "Your pantry covers the combined ingredient amounts in this plan."} Planning has not changed your pantry quantities.`,
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
    const shortages = buildShoppingList(pantry, [
      {
        id: "recipe-preview",
        recipe: focusedRecipe,
        servings: focusedServings,
      },
    ]);
    return response(
      `${focusedRecipe.name} takes ${focusedRecipe.minutes} minutes. For ${focusedServings} servings, ${shortages.length ? `you need to pick up: ${shortageSummary(shortages)}.` : "your pantry covers all the ingredient amounts."} This checks this recipe on its own; your shopping list combines every planned meal. Open Ingredients & steps for the complete recipe.`,
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
      pantry,
      preferences: { ...preferences, maxMinutes: 120 },
    });
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
    pantry,
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
            item.quantity > 0 &&
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
    `Here ${recipes.length === 1 ? "is a sample meal" : "are sample meals"} ${wantsSoon ? "using your available use-soon ingredients" : wantsQuicker ? "that take less time" : ingredientId ? `with ${ingredientQuery}` : "matched to your pantry"}, for ${preferences.servings} servings and up to ${preferences.maxMinutes} minutes. These are demo suggestions. Save a recipe, discuss it, or add it to your plan when it suits you.`,
    recipes,
  );
}
