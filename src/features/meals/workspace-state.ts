import {
  chatMessageSchema,
  householdStateSchema,
  type ChatMessage,
  type HouseholdState,
  type PantryItem,
  type Preferences,
  type Recipe,
  type RecipeSource,
  type WorkspaceMode,
} from "@/lib/contracts";

export type HouseholdAction =
  | { type: "replace"; state: HouseholdState }
  | { type: "setPantry"; pantry: PantryItem[] }
  | { type: "setPreferences"; preferences: Preferences }
  | { type: "addMeal"; id: string; recipe: Recipe; servings: number }
  | { type: "removeMeal"; id: string }
  | { type: "setMealServings"; id: string; servings: number }
  | { type: "setWorkspaceMode"; mode: WorkspaceMode }
  | { type: "saveRecipe"; recipe: Recipe; source: RecipeSource }
  | { type: "removeSavedRecipe"; recipeId: string }
  | { type: "setChatDraft"; text: string }
  | { type: "discussRecipe"; recipe: Recipe; servings: number }
  | { type: "clearRecipeFocus" }
  | { type: "appendChatMessages"; messages: ChatMessage[] }
  | { type: "completeChatTurn"; messages: ChatMessage[]; submittedDraft: string }
  | { type: "clearChat" };

function nextHousehold(
  current: HouseholdState,
  action: HouseholdAction,
): HouseholdState {
  switch (action.type) {
    case "replace":
      return action.state;
    case "setPantry":
      return { ...current, pantry: action.pantry };
    case "setPreferences":
      return { ...current, preferences: action.preferences };
    case "addMeal":
      return {
        ...current,
        meals: [
          ...current.meals,
          { id: action.id, recipe: action.recipe, servings: action.servings },
        ],
      };
    case "removeMeal":
      return {
        ...current,
        meals: current.meals.filter((meal) => meal.id !== action.id),
      };
    case "setMealServings":
      return {
        ...current,
        meals: current.meals.map((meal) =>
          meal.id === action.id ? { ...meal, servings: action.servings } : meal,
        ),
      };
    case "setWorkspaceMode":
      return {
        ...current,
        workspace: { ...current.workspace, mode: action.mode },
      };
    case "saveRecipe": {
      const saved = { recipe: action.recipe, source: action.source };
      const exists = current.workspace.recipeBox.some(
        (entry) => entry.recipe.id === action.recipe.id,
      );
      return {
        ...current,
        workspace: {
          ...current.workspace,
          recipeBox: exists
            ? current.workspace.recipeBox.map((entry) =>
                entry.recipe.id === action.recipe.id ? saved : entry,
              )
            : [...current.workspace.recipeBox, saved],
        },
      };
    }
    case "removeSavedRecipe":
      return {
        ...current,
        workspace: {
          ...current.workspace,
          recipeBox: current.workspace.recipeBox.filter(
            (entry) => entry.recipe.id !== action.recipeId,
          ),
        },
      };
    case "setChatDraft":
      return {
        ...current,
        workspace: { ...current.workspace, chatDraft: action.text },
      };
    case "discussRecipe":
      return {
        ...current,
        workspace: {
          ...current.workspace,
          focusedRecipe: action.recipe,
          focusedServings: action.servings,
          mode: "chat",
        },
      };
    case "clearRecipeFocus":
      return {
        ...current,
        workspace: {
          ...current.workspace,
          focusedRecipe: null,
          focusedServings: null,
        },
      };
    case "appendChatMessages":
    case "completeChatTurn": {
      // Check every incoming message before trimming the retained history.
      const messages = action.messages.map((message) =>
        chatMessageSchema.parse(message),
      );
      return {
        ...current,
        workspace: {
          ...current.workspace,
          chatMessages: [...current.workspace.chatMessages, ...messages].slice(
            -20,
          ),
          chatDraft:
            action.type === "completeChatTurn" &&
            current.workspace.chatDraft === action.submittedDraft
              ? ""
              : current.workspace.chatDraft,
        },
      };
    }
    case "clearChat":
      return {
        ...current,
        workspace: {
          ...current.workspace,
          chatMessages: [],
          chatDraft: "",
          focusedRecipe: null,
          focusedServings: null,
        },
      };
  }
}

/** Validate limits and create independent snapshots without changing inventory. */
export function applyHouseholdAction(
  current: HouseholdState,
  action: HouseholdAction,
): HouseholdState {
  // Zod parses nested objects into fresh data, so recipes held by callers, the
  // recipe box, conversation, and meal plan never share a mutable snapshot.
  return householdStateSchema.parse(nextHousehold(current, action));
}

export type HouseholdStore = {
  state: HouseholdState;
  updateError: string | null;
};

/** Invalid edits retain the last valid state and provide a visible UI error. */
export function householdReducer(
  current: HouseholdStore,
  action: HouseholdAction,
): HouseholdStore {
  try {
    return {
      state: applyHouseholdAction(current.state, action),
      updateError: null,
    };
  } catch {
    return {
      ...current,
      updateError:
        "That change could not be applied. Check quantities, servings, and message length. Limits are 200 ingredients, 50 planned meals, and 100 saved recipes.",
    };
  }
}
