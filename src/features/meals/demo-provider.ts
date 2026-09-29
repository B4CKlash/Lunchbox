import {
  suggestMealsRequestSchema,
  type Recipe,
  type SuggestMealsRequest,
  type SuggestMealsResponse,
} from "@/lib/contracts";

const RECIPES: Recipe[] = [
  {
    id: "r1",
    name: "Tomato & lentil skillet",
    description: "A warm, easy dinner built around your tomatoes.",
    minutes: 25,
    servings: 2,
    ingredients: [
      {
        ingredientId: "tomatoes",
        name: "Roma tomatoes",
        quantity: 400,
        unit: "g",
      },
      {
        ingredientId: "lentils",
        name: "Cooked lentils",
        quantity: 250,
        unit: "g",
      },
      { ingredientId: "rice", name: "Jasmine rice", quantity: 150, unit: "g" },
      {
        ingredientId: "onion",
        name: "Yellow onion",
        quantity: 1,
        unit: "each",
      },
      { ingredientId: "oil", name: "Olive oil", quantity: 15, unit: "ml" },
      { ingredientId: "spinach", name: "Spinach", quantity: 100, unit: "g" },
    ],
    steps: [
      "Soften the chopped onion in the oil in a deep, lidded skillet.",
      "Add chopped tomatoes, rice and water as needed for your rice. Cover and simmer, checking the rice until cooked.",
      "Stir in the cooked lentils and spinach. Heat through, season to taste and divide into portions.",
    ],
  },
  {
    id: "r2",
    name: "Garden rice bowls",
    description: "A colorful way to use your garden vegetables.",
    minutes: 30,
    servings: 2,
    ingredients: [
      { ingredientId: "zucchini", name: "Zucchini", quantity: 1, unit: "each" },
      {
        ingredientId: "pepper",
        name: "Sweet peppers",
        quantity: 1,
        unit: "each",
      },
      { ingredientId: "rice", name: "Jasmine rice", quantity: 150, unit: "g" },
      { ingredientId: "oil", name: "Olive oil", quantity: 15, unit: "ml" },
      {
        ingredientId: "beans",
        name: "Canned white beans",
        quantity: 200,
        unit: "g",
      },
      { ingredientId: "lemon", name: "Lemon", quantity: 1, unit: "each" },
    ],
    steps: [
      "Cook rice according to its package instructions.",
      "Cut the zucchini and pepper; toss with the oil and roast until tender.",
      "Warm the drained beans, assemble with the rice and vegetables, and finish with lemon.",
    ],
  },
  {
    id: "r3",
    name: "Pantry lentil rice",
    description: "A simple fallback for the nights you want less effort.",
    minutes: 25,
    servings: 2,
    ingredients: [
      {
        ingredientId: "lentils",
        name: "Cooked lentils",
        quantity: 250,
        unit: "g",
      },
      { ingredientId: "rice", name: "Jasmine rice", quantity: 150, unit: "g" },
      {
        ingredientId: "onion",
        name: "Yellow onion",
        quantity: 1,
        unit: "each",
      },
      { ingredientId: "oil", name: "Olive oil", quantity: 15, unit: "ml" },
    ],
    steps: [
      "Soften the chopped onion in the oil.",
      "Add rice and water according to package instructions. Cover and cook until the rice is tender.",
      "Fold in the cooked lentils, heat through and season to taste.",
    ],
  },
];

/** Deterministic demo boundary. Replace the provider here when AI is connected. */
export async function suggestMeals(
  input: SuggestMealsRequest,
): Promise<SuggestMealsResponse> {
  const { pantry, preferences } = suggestMealsRequestSchema.parse(input);
  const ranked = RECIPES.filter(
    (recipe) => recipe.minutes <= preferences.maxMinutes,
  ).map((recipe) => {
    let useSoon = 0;
    let coverage = 0;
    for (const ingredient of recipe.ingredients) {
      const matching = pantry.filter(
        (item) =>
          item.id === ingredient.ingredientId && item.unit === ingredient.unit,
      );
      const available = matching.reduce(
        (total, item) => total + item.quantity,
        0,
      );
      const required =
        (ingredient.quantity * preferences.servings) / recipe.servings;
      coverage += Math.min(1, available / required);
      if (matching.some((item) => item.useSoon && item.quantity > 0))
        useSoon += 1;
    }
    return {
      recipe,
      useSoon: preferences.prioritizeUseSoon ? useSoon : 0,
      coverage: coverage / recipe.ingredients.length,
    };
  });
  ranked.sort(
    (a, b) =>
      b.useSoon - a.useSoon ||
      b.coverage - a.coverage ||
      a.recipe.id.localeCompare(b.recipe.id),
  );
  return {
    source: "demo",
    recipes: structuredClone(ranked.map(({ recipe }) => recipe)),
  };
}
