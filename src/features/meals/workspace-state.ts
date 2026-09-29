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
  type WorkspaceMode,
} from "@/lib/contracts";

export type HouseholdAction =
  | { type: "replace"; state: HouseholdState }
  | { type: "setPantry"; pantry: PantryItem[] }
  | { type: "setPreferences"; preferences: Preferences }
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
      return { ...current, pantry: action.pantry };
    case "setPreferences":
      return { ...current, preferences: action.preferences };
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
        action.type === "commitCalendar"
          ? "Place every recipe in a calendar slot before committing your plan."
          : "That change could not be applied. Check quantities, servings, dates, and message length. Each calendar slot holds one meal. Limits are 200 ingredients, 50 planned meals, and 100 saved recipes.",
    };
  }
}
