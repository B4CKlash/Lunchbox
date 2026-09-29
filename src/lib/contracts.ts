import { z } from "zod";

// Integration-owned public contracts. Coordinate changes before editing these.
export const unitSchema = z.enum(["g", "ml", "each"]);
export const pantryTagSchema = z.enum(["staple", "seasonal", "special"]);
export const pantryItemSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  quantity: z.number().finite().min(0).max(100000),
  restockBelow: z.number().finite().min(0).max(100000).optional(),
  unit: unitSchema,
  location: z.enum(["Fridge", "Freezer", "Cupboard", "Garden"]),
  useSoon: z.boolean(),
  tag: pantryTagSchema.default("special"),
});
export const preferencesSchema = z.object({
  servings: z.number().int().min(1).max(12),
  maxMinutes: z.number().int().min(10).max(120),
  prioritizeUseSoon: z.boolean(),
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
export const householdStateSchema = z.object({
  version: z.literal(1),
  pantry: z.array(pantryItemSchema).max(200),
  preferences: preferencesSchema,
  meals: z.array(plannedMealSchema).max(50),
});
export const suggestMealsRequestSchema = z.object({
  pantry: z.array(pantryItemSchema).max(200),
  preferences: preferencesSchema,
});
export const suggestMealsResponseSchema = z.object({
  source: z.enum(["demo", "ai"]),
  recipes: z.array(recipeSchema).max(10),
});

export type Unit = z.infer<typeof unitSchema>;
export type PantryTag = z.infer<typeof pantryTagSchema>;
export type PantryItem = z.infer<typeof pantryItemSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type PlannedMeal = z.infer<typeof plannedMealSchema>;
export type HouseholdState = z.infer<typeof householdStateSchema>;
export type SuggestMealsRequest = z.infer<typeof suggestMealsRequestSchema>;
export type SuggestMealsResponse = z.infer<typeof suggestMealsResponseSchema>;
export type ShoppingItem = {
  ingredientId: string;
  name: string;
  unit: Unit;
  required: number;
  available: number;
  quantity: number;
  restock?: boolean;
};
