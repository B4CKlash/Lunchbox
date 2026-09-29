import { z } from "zod";

// Integration-owned public contracts. Coordinate changes before editing these.
export const unitSchema = z.enum(["g", "ml", "each"]);
export const pantryCategorySchema = z.enum([
  "protein",
  "carbs",
  "vegetables",
  "fruit",
  "fats",
  "dairy",
  "other",
]);
export const pantryItemSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  quantity: z.number().finite().min(0).max(100000),
  unit: unitSchema,
  location: z.enum(["Fridge", "Freezer", "Cupboard", "Garden"]),
  useSoon: z.boolean(),
  // Optional so households saved before categories were introduced still load.
  category: pantryCategorySchema.optional(),
});
export const mealGoalSchema = z.enum([
  "healthy-macros",
  "save-time",
  "reduce-waste",
  "save-money",
  "meal-prep",
]);
export const dietaryNeedSchema = z.enum([
  "vegetarian",
  "vegan",
  "pescatarian",
  "flexitarian",
  "omnivore",
  "gluten-free",
  "dairy-free",
  "nut-free",
]);
export const nutritionFocusSchema = z.enum([
  "high-protein",
  "lower-carb",
  "calorie-conscious",
  "more-vegetables",
  "high-fiber",
  "balanced",
]);
export const flavorPreferenceSchema = z.enum([
  "spicy",
  "mild",
  "savory",
  "bright-fresh",
  "rich-comforting",
  "smoky",
]);
export const cuisinePreferenceSchema = z.enum([
  "mediterranean",
  "mexican",
  "italian",
  "indian-inspired",
  "east-asian-inspired",
  "middle-eastern-inspired",
  "american-comfort",
]);
export const cookingStyleSchema = z.enum([
  "fast",
  "flavorful",
  "one-pot",
  "under-30",
  "big-batch",
  "meal-prep",
]);
export const preferencesSchema = z.object({
  servings: z.number().int().min(1).max(12),
  maxMinutes: z.number().int().min(10).max(120),
  prioritizeUseSoon: z.boolean(),
  onboardingComplete: z.boolean().optional(),
  goals: z.array(mealGoalSchema).max(5).optional(),
  dietaryNeeds: z.array(dietaryNeedSchema).max(8).optional(),
  allergies: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  dislikedIngredients: z
    .array(z.string().trim().min(1).max(40))
    .max(20)
    .optional(),
  nutritionFocus: z.array(nutritionFocusSchema).max(6).optional(),
  flavorPreferences: z.array(flavorPreferenceSchema).max(6).optional(),
  cuisinePreferences: z.array(cuisinePreferenceSchema).max(7).optional(),
  cookingStyles: z.array(cookingStyleSchema).max(6).optional(),
});
export const recipeIngredientSchema = z.object({
  ingredientId: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  quantity: z.number().finite().positive().max(100000),
  unit: unitSchema,
});
export const recipeSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().max(400),
  servings: z.number().int().min(1).max(12),
  minutes: z.number().int().positive().max(240),
  ingredients: z.array(recipeIngredientSchema).min(1).max(40),
  steps: z.array(z.string().min(1).max(1000)).min(1).max(20),
});
export const plannedMealSchema = z.object({
  id: z.string().min(1),
  recipe: recipeSchema,
  servings: z.number().int().min(1).max(12),
});
export const recipeSourceSchema = z.enum(["demo", "ai"]);
export const savedRecipeSchema = z.object({
  recipe: recipeSchema,
  source: recipeSourceSchema,
});
export const chatMessageSchema = z.object({
  id: z.string().min(1).max(120),
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000),
  source: recipeSourceSchema.optional(),
  recipes: z.array(recipeSchema).max(10).default([]),
  servings: z.number().int().min(1).max(12),
});
export const workspaceModeSchema = z.enum(["suggestions", "chat", "plan"]);
export const recipeWorkspaceSchema = z.object({
  mode: workspaceModeSchema.default("suggestions"),
  recipeBox: z.array(savedRecipeSchema).max(100).default([]),
  chatMessages: z.array(chatMessageSchema).max(20).default([]),
  chatDraft: z.string().max(1000).default(""),
  focusedRecipe: recipeSchema.nullable().default(null),
  focusedServings: z.number().int().min(1).max(12).nullable().default(null),
});
export const householdStateSchema = z.object({
  version: z.literal(1),
  pantry: z.array(pantryItemSchema).max(200),
  preferences: preferencesSchema,
  meals: z.array(plannedMealSchema).max(50),
  // Additive migration: existing v1 saves retain their kitchen and plan.
  workspace: recipeWorkspaceSchema.prefault({}),
});
export const suggestMealsRequestSchema = z.object({
  pantry: z.array(pantryItemSchema).max(200),
  preferences: preferencesSchema,
});
export const suggestMealsResponseSchema = z.object({
  source: recipeSourceSchema,
  recipes: z.array(recipeSchema).max(10),
});
export const chatMealsRequestSchema = z.object({
  pantry: z.array(pantryItemSchema).max(200),
  preferences: preferencesSchema,
  meals: z.array(plannedMealSchema).max(50),
  recipeBox: z.array(savedRecipeSchema).max(100),
  messages: z.array(chatMessageSchema).max(20),
  message: z.string().trim().min(1).max(1000),
  focusedRecipe: recipeSchema.optional(),
  focusedServings: z.number().int().min(1).max(12).optional(),
});
export const chatMealsResponseSchema = z.object({
  source: recipeSourceSchema,
  reply: z.string().min(1).max(2000),
  recipes: z.array(recipeSchema).max(10),
  servings: z.number().int().min(1).max(12),
});

export type Unit = z.infer<typeof unitSchema>;
export type PantryCategory = z.infer<typeof pantryCategorySchema>;
export type MealGoal = z.infer<typeof mealGoalSchema>;
export type DietaryNeed = z.infer<typeof dietaryNeedSchema>;
export type NutritionFocus = z.infer<typeof nutritionFocusSchema>;
export type FlavorPreference = z.infer<typeof flavorPreferenceSchema>;
export type CuisinePreference = z.infer<typeof cuisinePreferenceSchema>;
export type CookingStyle = z.infer<typeof cookingStyleSchema>;
export type PantryItem = z.infer<typeof pantryItemSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type PlannedMeal = z.infer<typeof plannedMealSchema>;
export type RecipeSource = z.infer<typeof recipeSourceSchema>;
export type SavedRecipe = z.infer<typeof savedRecipeSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type WorkspaceMode = z.infer<typeof workspaceModeSchema>;
export type RecipeWorkspace = z.infer<typeof recipeWorkspaceSchema>;
export type HouseholdState = z.infer<typeof householdStateSchema>;
export type SuggestMealsRequest = z.infer<typeof suggestMealsRequestSchema>;
export type SuggestMealsResponse = z.infer<typeof suggestMealsResponseSchema>;
export type ChatMealsRequest = z.infer<typeof chatMealsRequestSchema>;
export type ChatMealsResponse = z.infer<typeof chatMealsResponseSchema>;
export type ShoppingItem = {
  ingredientId: string;
  name: string;
  unit: Unit;
  required: number;
  available: number;
  quantity: number;
};
