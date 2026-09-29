import {
  suggestMealsRequestSchema,
  type Recipe,
  type SuggestMealsRequest,
  type SuggestMealsResponse,
  type CookingStyle,
  type CuisinePreference,
  type DietaryNeed,
  type FlavorPreference,
  type MealGoal,
  type NutritionFocus,
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

type RecipeProfile = {
  dietary: DietaryNeed[];
  goals: MealGoal[];
  nutrition: NutritionFocus[];
  flavors: FlavorPreference[];
  cuisines: CuisinePreference[];
  styles: CookingStyle[];
};

const plantBasedDietary: DietaryNeed[] = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "flexitarian",
  "omnivore",
  "gluten-free",
  "dairy-free",
  "nut-free",
];

const RECIPE_PROFILES: Record<string, RecipeProfile> = {
  r1: {
    dietary: plantBasedDietary,
    goals: ["healthy-macros", "save-time", "reduce-waste"],
    nutrition: ["high-protein", "lower-carb", "high-fiber", "balanced"],
    flavors: ["savory", "rich-comforting", "mild"],
    cuisines: ["mediterranean", "middle-eastern-inspired"],
    styles: ["flavorful", "one-pot", "under-30"],
  },
  r2: {
    dietary: plantBasedDietary,
    goals: ["healthy-macros", "reduce-waste"],
    nutrition: [
      "lower-carb",
      "calorie-conscious",
      "more-vegetables",
      "high-fiber",
      "balanced",
    ],
    flavors: ["spicy", "savory", "bright-fresh", "mild"],
    cuisines: ["mediterranean", "mexican"],
    styles: ["flavorful", "under-30"],
  },
  r3: {
    dietary: plantBasedDietary,
    goals: ["save-time", "save-money", "meal-prep"],
    nutrition: ["high-protein", "high-fiber", "balanced"],
    flavors: ["savory", "rich-comforting", "mild"],
    cuisines: ["middle-eastern-inspired", "american-comfort"],
    styles: ["fast", "one-pot", "under-30", "big-batch", "meal-prep"],
  },
};

/** Deterministic demo boundary. Replace the provider here when AI is connected. */
export async function suggestMeals(
  input: SuggestMealsRequest,
): Promise<SuggestMealsResponse> {
  const { pantry, preferences } = suggestMealsRequestSchema.parse(input);
  const dietaryNeeds = preferences.dietaryNeeds ?? [];
  const allergies = (preferences.allergies ?? []).map((item) =>
    item.toLowerCase(),
  );
  const dislikedIngredients = (preferences.dislikedIngredients ?? []).map(
    (item) => item.toLowerCase(),
  );
  const selectedGoals = preferences.goals ?? [];
  const selectedNutrition = preferences.nutritionFocus ?? [];
  const selectedFlavors = preferences.flavorPreferences ?? [];
  const selectedCuisines = preferences.cuisinePreferences ?? [];
  const selectedStyles = preferences.cookingStyles ?? [];
  const personalized =
    selectedGoals.length > 0 ||
    selectedNutrition.length > 0 ||
    selectedFlavors.length > 0 ||
    selectedCuisines.length > 0 ||
    selectedStyles.length > 0;
  const ranked = RECIPES.filter(
    (recipe) => {
      const profile = RECIPE_PROFILES[recipe.id];
      const matchesDiet = dietaryNeeds.every((need) =>
        profile.dietary.includes(need),
      );
      const containsAllergy = allergies.some((allergy) =>
        recipe.ingredients.some((ingredient) =>
          `${ingredient.ingredientId} ${ingredient.name}`
            .toLowerCase()
            .includes(allergy),
        ),
      );
      const containsDislike = dislikedIngredients.some((dislike) =>
        recipe.ingredients.some((ingredient) =>
          `${ingredient.ingredientId} ${ingredient.name}`
            .toLowerCase()
            .includes(dislike),
        ),
      );
      return (
        recipe.minutes <= preferences.maxMinutes &&
        matchesDiet &&
        !containsAllergy &&
        !containsDislike
      );
    },
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
      preferenceScore:
        selectedGoals.filter((goal) =>
          RECIPE_PROFILES[recipe.id].goals.includes(goal),
        ).length +
        selectedNutrition.filter((focus) =>
          RECIPE_PROFILES[recipe.id].nutrition.includes(focus),
        ).length +
        selectedFlavors.filter((flavor) =>
          RECIPE_PROFILES[recipe.id].flavors.includes(flavor),
        ).length +
        selectedCuisines.filter((cuisine) =>
          RECIPE_PROFILES[recipe.id].cuisines.includes(cuisine),
        ).length +
        selectedStyles.filter((style) =>
          RECIPE_PROFILES[recipe.id].styles.includes(style),
        ).length,
    };
  });
  ranked.sort(
    (a, b) =>
      (personalized ? b.preferenceScore - a.preferenceScore : 0) ||
      b.useSoon - a.useSoon ||
      b.coverage - a.coverage ||
      a.recipe.id.localeCompare(b.recipe.id),
  );
  return {
    source: "demo",
    recipes: structuredClone(ranked.map(({ recipe }) => recipe)),
  };
}
