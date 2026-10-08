import {
  chatMessageSchema,
  householdStateSchema,
  type CalendarSettings,
  type ChatMessage,
  type HouseholdState,
  type PantryItem,
  type PlannedMeal,
  type Preferences,
  type Recipe,
  type RecipeSource,
  type SuggestMealsRequest,
  type WorkspaceMode,
} from "@/lib/contracts";
import { pendingPantryIngredients, rememberRecipeNames } from "./suggestion-history";

export type HouseholdAction =
  | { type: "replace"; state: HouseholdState }
  | { type: "setPantry"; pantry: PantryItem[]; confirmedExactStock?: { ingredientId: string; unit: PantryItem["unit"] }[] }
  | { type: "setPreferences"; preferences: Preferences }
  | { type: "recordSuggestions"; input: SuggestMealsRequest; recipes: Recipe[] }
  | { type: "deferAiRequests"; until: number }
  | {
      type: "addMeal";
      id: string;
      recipe: Recipe;
      servings: number;
      calendarStartDate?: string;
    }
  | { type: "removeMeal"; id: string; calendarStartDate?: string }
  | {
      type: "setMealServings";
      id: string;
      servings: number;
      calendarStartDate?: string;
    }
  | { type: "setCalendarSettings"; patch: Partial<CalendarSettings> }
  | {
      type: "setCalendarDraft";
      meals: PlannedMeal[];
      calendarStartDate?: string;
    }
  | { type: "commitCalendar" }
  | { type: "discardCalendarDraft" }
  | { type: "setWorkspaceMode"; mode: WorkspaceMode }
  | { type: "saveRecipe"; recipe: Recipe; source: RecipeSource }
  | { type: "removeSavedRecipe"; recipeId: string }
  | { type: "setChatDraft"; text: string }
  | { type: "discussRecipe"; recipe: Recipe; servings: number }
  | { type: "clearRecipeFocus" }
  | { type: "appendChatMessages"; messages: ChatMessage[] }
  | {
      type: "completeChatTurn";
      messages: ChatMessage[];
      submittedDraft: string;
    }
  | { type: "clearChat" };

function nextHousehold(
  current: HouseholdState,
  action: HouseholdAction,
): HouseholdState {
  if (current.pilot) {
    const pilot = current.pilot;
    if (action.type === "addMeal" || action.type === "discussRecipe") {
      return { ...current, pilot: { ...pilot, session: {
        ...pilot.session,
        candidates: [...pilot.session.candidates.filter((recipe) => recipe.id !== action.recipe.id), action.recipe].slice(-30),
        focusedRecipeId: action.recipe.id,
      } } };
    }
    if (["removeMeal", "setMealServings", "setCalendarDraft", "commitCalendar", "discardCalendarDraft", "setCalendarSettings"].includes(action.type)) {
      throw new Error("Use the live planning workspace to change the calendar.");
    }
  }
  const editableMeals = current.workspace.calendar.draft ?? current.meals;
  const withDraft = (draft: PlannedMeal[] | null): HouseholdState => ({
    ...current,
    workspace: {
      ...current.workspace,
      calendar: {
        ...current.workspace.calendar,
        // The provider supplies the event's local week so saved drafts do not
        // shift when reopened later, while reducer results stay deterministic.
        startDate:
          current.workspace.calendar.startDate ??
          ("calendarStartDate" in action
            ? (action.calendarStartDate ?? null)
            : null),
        draft,
      },
    },
  });
  switch (action.type) {
    case "replace":
      return action.state;
    case "setPantry":
      return {
        ...current,
        pantry: action.pantry,
        workspace: {
          ...current.workspace,
          suggestions: {
            ...current.workspace.suggestions,
            pendingIngredients: pendingPantryIngredients(current.pantry, action.pantry, current.workspace.suggestions.pendingIngredients),
          },
        },
      };
    case "setPreferences":
      return { ...current, preferences: action.preferences };
    case "deferAiRequests":
      if (!Number.isSafeInteger(action.until) || action.until < 0) return current;
      return {
        ...current,
        workspace: {
          ...current.workspace,
          aiCooldownUntil: Math.max(current.workspace.aiCooldownUntil, action.until),
        },
      };
    case "recordSuggestions": {
      // A late response must not consume newer pantry edits or preference changes.
      if (!action.recipes.length || JSON.stringify(action.input.pantry) !== JSON.stringify(current.pantry) || JSON.stringify(action.input.preferences) !== JSON.stringify(current.preferences))
        return current;
      return {
        ...current,
        workspace: {
          ...current.workspace,
          suggestions: {
            recentRecipeNames: rememberRecipeNames(current.workspace.suggestions.recentRecipeNames, action.recipes),
            pendingIngredients: [],
          },
        },
      };
    }
    case "addMeal":
      return withDraft([
        ...editableMeals,
        { id: action.id, recipe: action.recipe, servings: action.servings },
      ]);
    case "removeMeal":
      return withDraft(editableMeals.filter((meal) => meal.id !== action.id));
    case "setMealServings":
      return withDraft(
        editableMeals.map((meal) =>
          meal.id === action.id ? { ...meal, servings: action.servings } : meal,
        ),
      );
    case "setCalendarSettings":
      return {
        ...current,
        workspace: {
          ...current.workspace,
          calendar: {
            ...current.workspace.calendar,
            ...action.patch,
            draft: current.workspace.calendar.draft,
          },
        },
      };
    case "setCalendarDraft":
      return withDraft(action.meals);
    case "commitCalendar": {
      const draft = current.workspace.calendar.draft;
      if (draft === null) return current;
      if (draft.some((meal) => !meal.date || !meal.slot)) {
        throw new Error(
          "Place every recipe on the calendar before committing.",
        );
      }
      return { ...withDraft(null), meals: draft };
    }
    case "discardCalendarDraft":
      return withDraft(null);
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
  const next = nextHousehold(current, action);
  if (current.pilot && next.pilot && action.type !== "replace") {
    next.pilot = { ...next.pilot, revision: current.pilot.revision + 1,
      // A later action must never undo an earlier pantry or preference update.
      receipts: next.pilot.receipts.map((receipt) => { const copy = { ...receipt }; delete copy.inverse; return copy; }),
    };
    if (action.type === "setPantry") {
      const confirmed = new Set((action.confirmedExactStock ?? []).map((item) => JSON.stringify([item.ingredientId, item.unit])));
      next.pilot.stock = next.pilot.stock.filter((stock) => {
        if (confirmed.has(JSON.stringify([stock.ingredientId, stock.unit]))) return false;
        const before = current.pantry.filter((item) => item.id === stock.ingredientId && item.unit === stock.unit);
        const after = next.pantry.filter((item) => item.id === stock.ingredientId && item.unit === stock.unit);
        return JSON.stringify(before.map((item) => item.quantity)) === JSON.stringify(after.map((item) => item.quantity));
      });
      next.pilot.stockChecks = next.pilot.stockChecks.filter((stock) => !confirmed.has(JSON.stringify([stock.ingredientId, stock.unit])));
    }
  }
  return householdStateSchema.parse(next);
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
        action.type === "commitCalendar"
          ? "Place every recipe in a calendar slot before committing your plan."
          : "That change could not be applied. Check quantities, servings, dates, and message length. Each calendar slot holds one meal. Limits are 200 ingredients, 50 planned meals, and 100 saved recipes.",
    };
  }
}
