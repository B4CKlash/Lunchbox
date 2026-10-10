import { recipeSchema, type HouseholdState, type Recipe, type Unit } from "@/lib/contracts";
import { knownIngredientsFromHousehold, resolveIngredient } from "@/features/pantry/ingredients";

/** Authored examples for proving the interaction. No model or paid service is called. */
export function planningFixtureRecipe(state: HouseholdState, variation: "pasta" | "vegetables" | "quick" | "cuisine" = "pasta"): Recipe {
  const known = knownIngredientsFromHousehold(state);
  function ingredient(name: string, quantity: number, unit: Unit) {
    const resolved = resolveIngredient({ name, unit }, known);
    if (resolved.status !== "resolved") throw new Error(`Choose a canonical ingredient for ${name} in your pantry first.`);
    return { ...resolved.ingredient, quantity };
  }
  const quick = variation === "quick";
  const vegetables = variation === "vegetables";
  const cuisine = variation === "cuisine";
  return recipeSchema.parse({
    id: `pilot-fixture-${variation}`,
    name: vegetables ? "Garden vegetable & white bean skillet" : cuisine ? "Lemony Mediterranean vegetable pasta" : quick ? "Quick tomato & spinach pasta" : "Roasted vegetable pasta",
    description: vegetables ? "An authored vegetable-focused example with zucchini, peppers, tomatoes, and white beans." : cuisine ? "An authored variation using lemon and white beans with the same vegetable base." : quick ? "An authored 20-minute version: chop small and cook the vegetables while the pasta boils." : "An authored batch-friendly example: roast the vegetables once and portion the pasta across your week.",
    servings: 2,
    minutes: quick ? 20 : 30,
    ingredients: [
      ...(vegetables ? [] : [ingredient("Dry pasta", 180, "g")]),
      ingredient("Tomatoes", 300, "g"),
      ...(quick ? [ingredient("Spinach", 100, "g")] : [ingredient("Zucchini", 1, "each"), ingredient("Sweet peppers", 1, "each")]),
      ingredient("Olive oil", 15, "ml"),
      ...(vegetables || cuisine ? [ingredient("Canned white beans", 200, "g")] : []),
      ...(cuisine ? [ingredient("Lemon", 1, "each")] : []),
    ],
    steps: vegetables ? [
      "Dice the zucchini and pepper. Warm the oil in a skillet and sauté the vegetables until tender.",
      "Add chopped tomatoes and simmer until softened. Stir in the drained white beans and heat through.",
      "Season to taste. Divide into the portions you actually produced, then record cooking in LunchBox.",
    ] : quick ? [
      "Boil the pasta according to its packet. Reserve a little pasta water before draining.",
      "Meanwhile finely chop the tomatoes and cook in the oil until softened. Stir in the spinach until wilted.",
      "Toss with the pasta and enough reserved water to coat. Season to taste and portion.",
    ] : [
      "Heat the oven to 220°C / 425°F. Chop the tomatoes, zucchini, and pepper, toss in the oil, and roast until tender, about 20 minutes.",
      "Meanwhile cook the pasta according to its packet and drain, reserving a little pasta water.",
      cuisine ? "Warm the white beans. Toss pasta, roasted vegetables, beans, lemon juice, and a little pasta water together. Season to taste." : "Toss the pasta and vegetables together with a little pasta water. Season to taste.",
      "Divide into the portions you actually produced. Record cooking and set aside any portions intended for the freezer.",
    ],
    provenance: { source: "demo" },
  });
}

export function findPlanningFavorites(state: HouseholdState): Recipe[] {
  // Saved recipes and "make again" are explicit household choices.
  const feedback = new Map(state.pilot?.feedback.map((entry) => [entry.recipeId, entry]) ?? []);
  const rejected = new Set(state.pilot?.session.rejectedRecipeIds ?? []);
  const recipes = new Map<string, Recipe>();
  for (const { recipe, source } of state.workspace.recipeBox) recipes.set(recipe.id, { ...recipe, provenance: recipe.provenance ?? { source } });
  for (const batch of state.pilot?.batches ?? []) if (feedback.get(batch.recipe.id)?.makeAgain) recipes.set(batch.recipe.id, batch.recipe);
  return [...recipes.values()].filter((recipe) => !rejected.has(recipe.id) && feedback.get(recipe.id)?.makeAgain !== false)
    .sort((left, right) => (feedback.get(right.id)?.rating ?? 0) - (feedback.get(left.id)?.rating ?? 0));
}

export function fixtureRecipeForRequest(state: HouseholdState, request: string): { reply: string; recipes: Recipe[] } {
  if (/favou?rite|recipe box|saved recipe/i.test(request)) {
    const recipes = findPlanningFavorites(state);
    return { reply: recipes.length ? "Here are your saved recipes and meals marked ‘make again,’ ordered by your latest ratings. Select one to discuss it or place a batch on the calendar." : "No favorites fit this session: your recipe box may be empty, marked not to make again, or ruled out while planning. Save another recipe or explicitly reconsider an earlier card. You can also explore the clearly labeled examples here.", recipes: recipes.slice(0, 8) };
  }
  const variation = /quick|quicker|effort|20.minute/i.test(request) ? "quick" : /cuisine|mediterranean|lemon/i.test(request) ? "cuisine" : /vegetable|garden|farm/i.test(request) ? "vegetables" : "pasta";
  const recipe = planningFixtureRecipe(state, variation);
  if (state.pilot?.session.rejectedRecipeIds.includes(recipe.id)) return {
    reply: "You ruled out this authored example for this session. Choose another example, explicitly reconsider its earlier card, or use Local AI to explore a different recipe.", recipes: [],
  };
  return { reply: `Here is an authored ${variation === "quick" ? "quicker" : variation === "cuisine" ? "Mediterranean" : variation === "vegetables" ? "vegetable-focused" : "batch-cooking"} example. This is a fixture, not a generated recipe. Discussing it leaves your calendar unchanged; choose a placement when it fits.`, recipes: [recipe] };
}
