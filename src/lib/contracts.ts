import { z } from "zod";

// Integration-owned public contracts. Coordinate changes before editing these.
export const unitSchema = z.enum(["g", "ml", "each"]);
export const pantryTagSchema = z.enum(["staple", "seasonal", "special"]);
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
  restockBelow: z.number().finite().min(0).max(100000).optional(),
  unit: unitSchema,
  location: z.enum(["Fridge", "Freezer", "Cupboard", "Garden"]),
  useSoon: z.boolean(),
  tag: pantryTagSchema.default("special"),
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
export const preferenceNotesSchema = z.object({
  goals: z.string().trim().max(500).optional(),
  dietary: z.string().trim().max(500).optional(),
  nutrition: z.string().trim().max(500).optional(),
  taste: z.string().trim().max(500).optional(),
  cooking: z.string().trim().max(500).optional(),
});
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
  customNotes: preferenceNotesSchema.optional(),
});
export const recipeIngredientSchema = z.object({
  ingredientId: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  quantity: z.number().finite().positive().max(100000),
  unit: unitSchema,
});
export const knownIngredientSchema = recipeIngredientSchema.omit({ quantity: true });
export const recipeContentSourceSchema = z.enum(["demo", "ai", "import"]);
export const recipeProvenanceSchema = z.object({
  source: recipeContentSourceSchema,
  method: z.enum(["text", "url"]).optional(),
  sourceUrl: z.url().max(2048).refine((value) => new URL(value).protocol === "https:").optional(),
  title: z.string().max(200).optional(),
  author: z.string().max(200).optional(),
});
export const recipeSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().max(400),
  servings: z.number().int().min(1).max(12),
  minutes: z.number().int().positive().max(240),
  ingredients: z.array(recipeIngredientSchema).min(1).max(40),
  steps: z.array(z.string().min(1).max(1000)).min(1).max(20),
  provenance: recipeProvenanceSchema.optional(),
});
export const mealSlotSchema = z.enum(["breakfast", "lunch", "snack", "dinner"]);
export const calendarDateSchema = z.iso.date();
export const plannedMealSchema = z
  .object({
    id: z.string().min(1),
    recipe: recipeSchema,
    servings: z.number().int().min(1).max(12),
    // Both absent keeps recipe inbox entries and older saved plans readable.
    date: calendarDateSchema.optional(),
    slot: mealSlotSchema.optional(),
  })
  .refine((meal) => Boolean(meal.date) === Boolean(meal.slot), {
    message: "Choose both a date and a meal slot.",
  });
export const plannedMealsSchema = z
  .array(plannedMealSchema)
  .max(50)
  .superRefine((meals, context) => {
    const ids = new Set<string>();
    const occupied = new Set<string>();
    for (const [index, meal] of meals.entries()) {
      if (ids.has(meal.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Each planned meal needs a unique ID.",
        });
      }
      ids.add(meal.id);
      if (meal.date && meal.slot) {
        const key = `${meal.date}:${meal.slot}`;
        if (occupied.has(key)) {
          context.addIssue({
            code: "custom",
            path: [index, "slot"],
            message: "A meal already occupies this calendar slot.",
          });
        }
        occupied.add(key);
      }
    }
  });
export const calendarWorkspaceSchema = z.object({
  startDate: calendarDateSchema.nullable().default(null),
  days: z.number().int().min(1).max(28).default(7),
  slots: z
    .array(mealSlotSchema)
    .min(1)
    .max(4)
    .refine((slots) => new Set(slots).size === slots.length, {
      message: "Choose each meal slot only once.",
    })
    .default(["breakfast", "lunch", "dinner"]),
  targetMeals: z.number().int().min(1).max(50).default(7),
  // Null means the editable calendar is identical to the committed plan.
  draft: plannedMealsSchema.nullable().default(null),
});
export const recipeSourceSchema = z.enum(["demo", "ai"]);
export const savedRecipeSchema = z.object({
  recipe: recipeSchema,
  source: recipeContentSourceSchema,
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
export const suggestionMemorySchema = z.object({
  recentRecipeNames: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  pendingIngredients: z.array(knownIngredientSchema).max(200).default([]),
});
export const recipeWorkspaceSchema = z.object({
  mode: workspaceModeSchema.default("suggestions"),
  recipeBox: z.array(savedRecipeSchema).max(100).default([]),
  chatMessages: z.array(chatMessageSchema).max(20).default([]),
  chatDraft: z.string().max(1000).default(""),
  focusedRecipe: recipeSchema.nullable().default(null),
  focusedServings: z.number().int().min(1).max(12).nullable().default(null),
  calendar: calendarWorkspaceSchema.prefault({}),
  suggestions: suggestionMemorySchema.prefault({}),
});
export const householdStateSchema = z.object({
  version: z.literal(1),
  pantry: z.array(pantryItemSchema).max(200),
  preferences: preferencesSchema,
  meals: plannedMealsSchema,
  // Additive migration: existing v1 saves retain their kitchen and plan.
  workspace: recipeWorkspaceSchema.prefault({}),
});
export const suggestMealsRequestSchema = z.object({
  pantry: z.array(pantryItemSchema).max(200),
  preferences: preferencesSchema,
  knownIngredients: z.array(knownIngredientSchema).max(2000).optional(),
  // Bounded context from the existing household workspace.
  recentRecipeNames: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  preferredIngredients: z.array(knownIngredientSchema).max(200).optional(),
});
export const suggestMealsResponseSchema = z.object({
  source: recipeSourceSchema,
  recipes: z.array(recipeSchema).max(10),
  explanation: z.string().min(1).max(2000).optional(),
});
export const chatMealsRequestSchema = z.object({
  pantry: z.array(pantryItemSchema).max(200),
  preferences: preferencesSchema,
  meals: z.array(plannedMealSchema).max(50),
  planStatus: z.enum(["draft", "committed"]).optional(),
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

// Import drafts are intentionally not Recipes: unresolved fields must be reviewed.
export const recipeDraftIngredientSchema = z.object({
  originalLine: z.string().max(1000),
  name: z.string().max(80),
  ingredientId: z.string().max(80).nullable(),
  quantity: z.number().finite().positive().max(100000).nullable(),
  unit: unitSchema.nullable(),
  candidates: z.array(knownIngredientSchema).max(200).optional(),
});
export const recipeDraftSchema = z.object({
  name: z.string().max(120),
  description: z.string().max(400),
  servings: z.number().int().min(1).max(12).nullable(),
  minutes: z.number().int().positive().max(240).nullable(),
  ingredients: z.array(recipeDraftIngredientSchema).min(1).max(40),
  steps: z.array(z.string().min(1).max(1000)).max(20),
});
const importContext = {
  knownIngredients: z.array(knownIngredientSchema).max(2000).optional(),
};
export const importRecipeRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(20000),
    sourceUrl: recipeProvenanceSchema.shape.sourceUrl, ...importContext }),
  z.object({ kind: z.literal("url"), url: z.url().max(2048), ...importContext }),
]);
export const importRecipeResponseSchema = z.object({
  draft: recipeDraftSchema,
  provenance: recipeProvenanceSchema,
  warnings: z.array(z.string().max(1000)).max(50),
});

export type Unit = z.infer<typeof unitSchema>;
export type PantryTag = z.infer<typeof pantryTagSchema>;
export type PantryCategory = z.infer<typeof pantryCategorySchema>;
export type MealGoal = z.infer<typeof mealGoalSchema>;
export type DietaryNeed = z.infer<typeof dietaryNeedSchema>;
export type NutritionFocus = z.infer<typeof nutritionFocusSchema>;
export type FlavorPreference = z.infer<typeof flavorPreferenceSchema>;
export type CuisinePreference = z.infer<typeof cuisinePreferenceSchema>;
export type CookingStyle = z.infer<typeof cookingStyleSchema>;
export type PreferenceNotes = z.infer<typeof preferenceNotesSchema>;
export type PantryItem = z.infer<typeof pantryItemSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type PlannedMeal = z.infer<typeof plannedMealSchema>;
export type RecipeSource = z.infer<typeof recipeContentSourceSchema>;
export type AssistantSource = z.infer<typeof recipeSourceSchema>;
export type RecipeProvenance = z.infer<typeof recipeProvenanceSchema>;
export type KnownIngredient = z.infer<typeof knownIngredientSchema>;
export type RecipeDraft = z.infer<typeof recipeDraftSchema>;
export type RecipeDraftIngredient = z.infer<typeof recipeDraftIngredientSchema>;
export type ImportRecipeRequest = z.infer<typeof importRecipeRequestSchema>;
export type ImportRecipeResponse = z.infer<typeof importRecipeResponseSchema>;
export type MealSlot = z.infer<typeof mealSlotSchema>;
export type CalendarWorkspace = z.infer<typeof calendarWorkspaceSchema>;
export type CalendarSettings = Omit<CalendarWorkspace, "draft">;
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
  restock?: boolean;
};
