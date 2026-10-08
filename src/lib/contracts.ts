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
  // Share provider cooldowns across Chat, Suggestions, and page reloads.
  aiCooldownUntil: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  recipeBox: z.array(savedRecipeSchema).max(100).default([]),
  chatMessages: z.array(chatMessageSchema).max(20).default([]),
  chatDraft: z.string().max(1000).default(""),
  focusedRecipe: recipeSchema.nullable().default(null),
  focusedServings: z.number().int().min(1).max(12).nullable().default(null),
  calendar: calendarWorkspaceSchema.prefault({}),
  suggestions: suggestionMemorySchema.prefault({}),
});
// The pilot is an additive part of the existing household snapshot. Old saves
// remain readable; ensurePilot performs the explicit, recoverable migration.
const pilotIdSchema = z.string().trim().min(1).max(160);
const portionsSchema = z.number().finite().positive().max(1000);
export const householdMemberSchema = z.object({
  id: pilotIdSchema,
  name: z.string().trim().min(1).max(80),
  preferences: z.string().max(2000).optional(),
});
export const mealCoverageSchema = z.object({
  id: pilotIdSchema,
  memberId: pilotIdSchema,
  date: calendarDateSchema,
  slot: mealSlotSchema,
  reason: z.enum(["work", "eating-out", "other"]),
  note: z.string().max(500).optional(),
});
export const cookingBatchInputSchema = z.object({
  id: pilotIdSchema,
  recipe: recipeSchema,
  prepareDate: calendarDateSchema,
  yield: portionsSchema,
  reservedExtra: z.number().finite().nonnegative().max(1000),
});
export const cookingBatchSchema = cookingBatchInputSchema.extend({
  status: z.enum(["planned", "cooked"]),
});
export const mealAllocationInputSchema = z.object({
  id: pilotIdSchema,
  batchId: pilotIdSchema,
  memberId: pilotIdSchema,
  date: calendarDateSchema,
  slot: mealSlotSchema,
  portions: portionsSchema,
});
export const mealAllocationSchema = mealAllocationInputSchema.extend({
  consumedAt: z.iso.datetime().optional(),
});
export const flexibleStockSchema = z.object({
  ingredientId: pilotIdSchema,
  name: z.string().min(1).max(80),
  unit: unitSchema,
  status: z.enum(["exact", "some", "low", "out"]),
  quantity: z.number().finite().nonnegative().max(100000).optional(),
  useSoon: z.boolean().optional(),
  sourceNote: z.string().max(1000).optional(),
}).refine((stock) => stock.status === "exact" ? stock.quantity !== undefined : stock.quantity === undefined, {
  message: "Exact stock requires a quantity; uncertain stock must not invent one.",
});
export const stockCheckSchema = z.object({
  ingredientId: pilotIdSchema,
  unit: unitSchema,
  fingerprint: z.string().min(1).max(100000),
});
export const preparedPortionsSchema = z.object({
  batchId: pilotIdSchema,
  produced: portionsSchema,
  consumed: z.number().finite().nonnegative().max(1000),
  freezerPortions: z.number().finite().nonnegative().max(1000),
  ingredientUses: z.array(recipeIngredientSchema).max(200).default([]),
  cookedAt: z.iso.datetime().optional(),
});
export const recipeFeedbackSchema = z.object({
  id: pilotIdSchema,
  recipeId: pilotIdSchema,
  memberId: pilotIdSchema.optional(),
  rating: z.number().int().min(1).max(5),
  makeAgain: z.boolean(),
  notes: z.string().max(2000),
});
export const planningSessionSchema = z.object({
  id: pilotIdSchema,
  startDate: calendarDateSchema,
  days: z.number().int().min(1).max(28),
  slots: z.array(mealSlotSchema).min(1).max(4),
  memberIds: z.array(pilotIdSchema).min(1).max(12),
  messages: z.array(chatMessageSchema).max(100),
  candidates: z.array(recipeSchema).max(30),
  focusedRecipeId: pilotIdSchema.nullable(),
  focusDate: calendarDateSchema.nullable().default(null),
  focusSlot: mealSlotSchema.nullable().default(null),
  rejectedRecipeIds: z.array(pilotIdSchema).max(200),
  constraints: z.string().max(2000),
  draft: z.string().max(2000).default(""),
  equipment: z.array(z.string().trim().min(1).max(80)).max(30),
});
export const pilotChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_coverage"), coverage: mealCoverageSchema }),
  z.object({ type: z.literal("clear_coverage"), coverageId: pilotIdSchema }),
  z.object({ type: z.literal("create_batch"), batch: cookingBatchInputSchema, allocations: z.array(mealAllocationInputSchema).max(200) }),
  z.object({ type: z.literal("allocate"), allocation: mealAllocationInputSchema }),
  z.object({ type: z.literal("remove_allocation"), allocationId: pilotIdSchema }),
  z.object({ type: z.literal("remove_batch"), batchId: pilotIdSchema }),
  z.object({ type: z.literal("set_shop_through"), date: calendarDateSchema }),
  z.object({ type: z.literal("set_stock"), stock: flexibleStockSchema }),
  z.object({ type: z.literal("confirm_stock"), ...stockCheckSchema.shape }),
  z.object({ type: z.literal("record_purchase"), items: z.array(recipeIngredientSchema).min(1).max(200) }),
  z.object({ type: z.literal("cook_batch"), batchId: pilotIdSchema, actualPortions: portionsSchema, freezerPortions: z.number().finite().nonnegative().max(1000) }),
  z.object({ type: z.literal("consume"), allocationId: pilotIdSchema, fromFreezer: z.boolean().optional() }),
  z.object({ type: z.literal("record_feedback"), feedback: recipeFeedbackSchema }),
  z.object({ type: z.literal("set_members"), members: z.array(householdMemberSchema).min(1).max(12) }),
]);
export const planningProposalSchema = z.object({
  id: pilotIdSchema,
  title: z.string().min(1).max(200),
  baseRevision: z.number().int().nonnegative(),
  changes: z.array(pilotChangeSchema).max(300),
  status: z.enum(["pending", "applied", "stale"]),
  legacyMeals: plannedMealsSchema.optional(),
});
export const pilotOperationSchema = z.discriminatedUnion("type", [
  ...pilotChangeSchema.options,
  z.object({ type: z.literal("set_session"), session: planningSessionSchema }),
  z.object({ type: z.literal("receive_planning_result"), baseRevision: z.number().int().nonnegative(), session: planningSessionSchema, proposal: z.object({ id: pilotIdSchema, title: z.string().min(1).max(200), changes: z.array(pilotChangeSchema).min(1).max(300) }).optional() }),
  z.object({ type: z.literal("propose"), id: pilotIdSchema, title: z.string().min(1).max(200), changes: z.array(pilotChangeSchema).min(1).max(300) }),
  z.object({ type: z.literal("apply_proposal"), proposalId: pilotIdSchema }),
  z.object({ type: z.literal("dismiss_proposal"), proposalId: pilotIdSchema }),
  z.object({ type: z.literal("undo"), receiptId: pilotIdSchema }),
]);
export const pilotCommandSchema = z.object({
  id: pilotIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  operation: pilotOperationSchema,
});
const pilotDataSchema = z.object({
  schemaVersion: z.literal(1),
  members: z.array(householdMemberSchema).min(1).max(12),
  coverage: z.array(mealCoverageSchema).max(2000),
  batches: z.array(cookingBatchSchema).max(1000),
  allocations: z.array(mealAllocationSchema).max(5000),
  stock: z.array(flexibleStockSchema).max(200),
  stockChecks: z.array(stockCheckSchema).max(200),
  prepared: z.array(preparedPortionsSchema).max(1000),
  feedback: z.array(recipeFeedbackSchema).max(1000),
  proposals: z.array(planningProposalSchema).max(100),
  unplacedMeals: plannedMealsSchema,
  session: planningSessionSchema,
  shopThrough: calendarDateSchema,
});
export const actionReceiptSchema = z.object({
  id: pilotIdSchema,
  commandId: pilotIdSchema,
  operationType: z.string().min(1).max(80),
  fingerprint: z.string().min(1).max(2000000),
  summary: z.string().min(1).max(500),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  undoneBy: pilotIdSchema.optional(),
  undoRevision: z.number().int().positive().optional(),
  // Only the latest reversible action retains its recovery data. Command IDs
  // remain in history so retries cannot repeat purchases or cooking.
  inverse: z.object({ pantry: z.array(pantryItemSchema).max(200), data: pilotDataSchema }).optional(),
});
export const pilotStateSchema = pilotDataSchema.extend({
  revision: z.number().int().nonnegative(),
  receipts: z.array(actionReceiptSchema).max(10000),
});

export const householdStateSchema = z.object({
  version: z.literal(1),
  pilot: pilotStateSchema.optional(),
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

export type HouseholdMember = z.infer<typeof householdMemberSchema>;
export type MealCoverage = z.infer<typeof mealCoverageSchema>;
export type CookingBatch = z.infer<typeof cookingBatchSchema>;
export type MealAllocation = z.infer<typeof mealAllocationSchema>;
export type FlexibleStock = z.infer<typeof flexibleStockSchema>;
export type StockCheck = z.infer<typeof stockCheckSchema>;
export type PreparedPortions = z.infer<typeof preparedPortionsSchema>;
export type RecipeFeedback = z.infer<typeof recipeFeedbackSchema>;
export type PlanningSession = z.infer<typeof planningSessionSchema>;
export type PlanningProposal = z.infer<typeof planningProposalSchema>;
export type PilotChange = z.infer<typeof pilotChangeSchema>;
export type PilotOperation = z.infer<typeof pilotOperationSchema>;
export type PilotCommand = z.infer<typeof pilotCommandSchema>;
export type ActionReceipt = z.infer<typeof actionReceiptSchema>;
export type PilotState = z.infer<typeof pilotStateSchema>;

// Server-authorized legacy actions share the same boundary validation. Replacing
// an entire snapshot is deliberately excluded from remotely writable actions.
export const householdActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("setPantry"), pantry: z.array(pantryItemSchema).max(200), confirmedExactStock: z.array(z.object({ ingredientId: pilotIdSchema, unit: unitSchema })).max(200).optional() }),
  z.object({ type: z.literal("setPreferences"), preferences: preferencesSchema }),
  z.object({ type: z.literal("recordSuggestions"), input: suggestMealsRequestSchema, recipes: z.array(recipeSchema).max(10) }),
  z.object({ type: z.literal("deferAiRequests"), until: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
  z.object({ type: z.literal("addMeal"), id: pilotIdSchema, recipe: recipeSchema, servings: z.number().int().min(1).max(12), calendarStartDate: calendarDateSchema.optional() }),
  z.object({ type: z.literal("removeMeal"), id: pilotIdSchema, calendarStartDate: calendarDateSchema.optional() }),
  z.object({ type: z.literal("setMealServings"), id: pilotIdSchema, servings: z.number().int().min(1).max(12), calendarStartDate: calendarDateSchema.optional() }),
  z.object({ type: z.literal("setCalendarSettings"), patch: calendarWorkspaceSchema.omit({ draft: true }).partial() }),
  z.object({ type: z.literal("setCalendarDraft"), meals: plannedMealsSchema, calendarStartDate: calendarDateSchema.optional() }),
  z.object({ type: z.literal("commitCalendar") }),
  z.object({ type: z.literal("discardCalendarDraft") }),
  z.object({ type: z.literal("setWorkspaceMode"), mode: workspaceModeSchema }),
  z.object({ type: z.literal("saveRecipe"), recipe: recipeSchema, source: recipeContentSourceSchema }),
  z.object({ type: z.literal("removeSavedRecipe"), recipeId: pilotIdSchema }),
  z.object({ type: z.literal("setChatDraft"), text: z.string().max(1000) }),
  z.object({ type: z.literal("discussRecipe"), recipe: recipeSchema, servings: z.number().int().min(1).max(12) }),
  z.object({ type: z.literal("clearRecipeFocus") }),
  z.object({ type: z.literal("appendChatMessages"), messages: z.array(chatMessageSchema).max(20) }),
  z.object({ type: z.literal("completeChatTurn"), messages: z.array(chatMessageSchema).max(20), submittedDraft: z.string().max(1000) }),
  z.object({ type: z.literal("clearChat") }),
]);
