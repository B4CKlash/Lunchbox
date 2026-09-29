"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type ChatMessage,
  type HouseholdState,
  type PantryItem,
  type Preferences,
  type Recipe,
  type RecipeSource,
  type WorkspaceMode,
} from "@/lib/contracts";
import {
  householdReducer,
  type HouseholdStore,
} from "@/features/meals/workspace-state";
import { createSampleHousehold } from "@/features/pantry/seed";
import { loadHousehold, saveHousehold } from "@/features/pantry/storage";

type HouseholdContextValue = {
  state: HouseholdState;
  ready: boolean;
  storageError: string | null;
  updateError: string | null;
  chatResetVersion: number;
  setPantry: (pantry: PantryItem[]) => void;
  setPreferences: (preferences: Preferences) => void;
  addMeal: (recipe: Recipe, servings: number) => void;
  removeMeal: (id: string) => void;
  setMealServings: (id: string, servings: number) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  saveRecipe: (recipe: Recipe, source: RecipeSource) => void;
  removeSavedRecipe: (recipeId: string) => void;
  setChatDraft: (text: string) => void;
  discussRecipe: (recipe: Recipe, servings: number) => void;
  clearRecipeFocus: () => void;
  appendChatMessages: (messages: ChatMessage[]) => void;
  completeChatTurn: (messages: ChatMessage[], submittedDraft: string) => void;
  clearChat: () => void;
  reset: () => void;
};
const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [{ state, updateError }, update] = useReducer(
    householdReducer,
    undefined,
    (): HouseholdStore => ({ state: createSampleHousehold(), updateError: null }),
  );
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  // Ephemeral request invalidation; resetting identical household data must
  // still prevent an older in-flight response from restoring cleared chat.
  const [chatResetVersion, setChatResetVersion] = useState(0);
  const hydrated = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate browser-only storage after SSR and report persistence failures. */
  useEffect(() => {
    // Hydrate once after mount so server markup and the first browser render agree.
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const saved = loadHousehold(window.localStorage);
      if (saved) update({ type: "replace", state: saved });
    } catch {
      setStorageError(
        "Saved data could not be loaded. You can use the sample kitchen for this visit.",
      );
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      saveHousehold(window.localStorage, state);
      setStorageError(null);
    } catch {
      setStorageError(
        "This browser could not save your changes. Keep this tab open to continue.",
      );
    }
  }, [state, ready]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <HouseholdContext.Provider
      value={{
        state,
        ready,
        storageError,
        updateError,
        chatResetVersion,
        setPantry: (pantry) => update({ type: "setPantry", pantry }),
        setPreferences: (preferences) =>
          update({ type: "setPreferences", preferences }),
        addMeal: (recipe, servings) => {
          const id = crypto.randomUUID();
          update({ type: "addMeal", id, recipe, servings });
        },
        removeMeal: (id) => update({ type: "removeMeal", id }),
        setMealServings: (id, servings) =>
          update({ type: "setMealServings", id, servings }),
        setWorkspaceMode: (mode) => update({ type: "setWorkspaceMode", mode }),
        saveRecipe: (recipe, source) =>
          update({ type: "saveRecipe", recipe, source }),
        removeSavedRecipe: (recipeId) =>
          update({ type: "removeSavedRecipe", recipeId }),
        setChatDraft: (text) => update({ type: "setChatDraft", text }),
        discussRecipe: (recipe, servings) =>
          update({ type: "discussRecipe", recipe, servings }),
        clearRecipeFocus: () => update({ type: "clearRecipeFocus" }),
        appendChatMessages: (messages) =>
          update({ type: "appendChatMessages", messages }),
        completeChatTurn: (messages, submittedDraft) =>
          update({ type: "completeChatTurn", messages, submittedDraft }),
        clearChat: () => {
          setChatResetVersion((version) => version + 1);
          update({ type: "clearChat" });
        },
        reset: () => {
          setStorageError(null);
          setChatResetVersion((version) => version + 1);
          update({ type: "replace", state: createSampleHousehold() });
        },
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (!context)
    throw new Error("useHousehold must be used inside HouseholdProvider");
  return context;
}
