import type {
  CookingStyle,
  DietaryNeed,
  CuisinePreference,
  FlavorPreference,
  MealGoal,
  NutritionFocus,
} from "@/lib/contracts";

export const goalOptions: ReadonlyArray<{
  value: MealGoal;
  title: string;
  description: string;
}> = [
  {
    value: "healthy-macros",
    title: "Eat well for my macros",
    description: "Favor balanced meals with protein, vegetables, and satisfying carbs.",
  },
  {
    value: "save-time",
    title: "Save time",
    description: "Keep cooking and decision-making quick on busy days.",
  },
  {
    value: "reduce-waste",
    title: "Use up older food",
    description: "Put use-soon pantry ingredients at the front of the line.",
  },
  {
    value: "save-money",
    title: "Spend less",
    description: "Prefer meals that make the most of what is already at home.",
  },
  {
    value: "meal-prep",
    title: "Plan ahead",
    description: "Find meals that work for leftovers and prepared lunches.",
  },
];

export const dietaryOptions: ReadonlyArray<{
  value: DietaryNeed;
  title: string;
}> = [
  { value: "vegetarian", title: "Vegetarian" },
  { value: "vegan", title: "Vegan" },
  { value: "pescatarian", title: "Pescatarian" },
  { value: "flexitarian", title: "Flexitarian" },
  { value: "omnivore", title: "No specific diet" },
  { value: "gluten-free", title: "Gluten-free" },
  { value: "dairy-free", title: "Dairy-free" },
  { value: "nut-free", title: "Nut-free" },
];

export const nutritionFocusOptions: ReadonlyArray<{
  value: NutritionFocus;
  title: string;
  description: string;
}> = [
  {
    value: "high-protein",
    title: "High protein",
    description: "Support strength training and building muscle.",
  },
  {
    value: "lower-carb",
    title: "Lower carb",
    description: "Favor meals with a lighter share of grains and starches.",
  },
  {
    value: "calorie-conscious",
    title: "Calorie-conscious",
    description: "Lean toward lighter, satisfying meals for weight goals.",
  },
  {
    value: "more-vegetables",
    title: "More vegetables",
    description: "Make colorful produce the biggest part of the plate.",
  },
  {
    value: "high-fiber",
    title: "High fiber",
    description: "Prioritize beans, lentils, vegetables, and whole foods.",
  },
  {
    value: "balanced",
    title: "Balanced plate",
    description: "Aim for a practical mix of protein, carbs, and vegetables.",
  },
];

export const flavorOptions: ReadonlyArray<{
  value: FlavorPreference;
  title: string;
}> = [
  { value: "spicy", title: "Spicy" },
  { value: "mild", title: "Mild" },
  { value: "savory", title: "Savory" },
  { value: "bright-fresh", title: "Bright & fresh" },
  { value: "rich-comforting", title: "Rich & comforting" },
  { value: "smoky", title: "Smoky" },
];

export const cuisineOptions: ReadonlyArray<{
  value: CuisinePreference;
  title: string;
}> = [
  { value: "mediterranean", title: "Mediterranean" },
  { value: "mexican", title: "Mexican" },
  { value: "italian", title: "Italian" },
  { value: "indian-inspired", title: "Indian-inspired" },
  { value: "east-asian-inspired", title: "East Asian-inspired" },
  { value: "middle-eastern-inspired", title: "Middle Eastern-inspired" },
  { value: "american-comfort", title: "American comfort" },
];

export const cookingStyleOptions: ReadonlyArray<{
  value: CookingStyle;
  title: string;
  description: string;
}> = [
  { value: "fast", title: "Fast", description: "As little hands-on time as possible" },
  { value: "flavorful", title: "Big flavor", description: "Make dinner feel worth looking forward to" },
  { value: "one-pot", title: "One pot", description: "Fewer dishes and a simpler cleanup" },
  { value: "under-30", title: "Under 30 minutes", description: "Weeknight-friendly from start to finish" },
  { value: "big-batch", title: "Big batch", description: "Cook once and make more than one meal" },
  { value: "meal-prep", title: "Meal prep", description: "Portion and reheat well later" },
];

export function selectedPreferenceLabels(values: string[]): string[] {
  const labels = [
    ...goalOptions,
    ...dietaryOptions,
    ...nutritionFocusOptions,
    ...flavorOptions,
    ...cuisineOptions,
    ...cookingStyleOptions,
  ];
  return values.flatMap((value) => {
    const match = labels.find((option) => option.value === value);
    return match ? [match.title] : [];
  });
}
