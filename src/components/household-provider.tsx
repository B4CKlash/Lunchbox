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
  householdStateSchema,
  type HouseholdState,
  type PantryItem,
  type Preferences,
  type Recipe,
} from "@/lib/contracts";
import { createSampleHousehold } from "@/features/pantry/seed";
import { loadHousehold, saveHousehold } from "@/features/pantry/storage";

type HouseholdContextValue = {
  state: HouseholdState;
  ready: boolean;
  storageError: string | null;
  updateError: string | null;
  setPantry: (pantry: PantryItem[]) => void;
  setPreferences: (preferences: Preferences) => void;
  addMeal: (recipe: Recipe, servings: number) => void;
  removeMeal: (id: string) => void;
  setMealServings: (id: string, servings: number) => void;
  reset: () => void;
};
const HouseholdContext = createContext<HouseholdContextValue | null>(null);

type StateUpdate =
  HouseholdState | ((current: HouseholdState) => HouseholdState);
type Store = { state: HouseholdState; updateError: string | null };
function householdReducer(current: Store, update: StateUpdate): Store {
  const result = householdStateSchema.safeParse(
    typeof update === "function" ? update(current.state) : update,
  );
  return result.success
    ? { state: result.data, updateError: null }
    : {
        ...current,
        updateError:
          "That change could not be applied. Check quantities and servings; a kitchen can hold up to 200 ingredients and 50 planned meals.",
      };
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [{ state, updateError }, update] = useReducer(
    householdReducer,
    undefined,
    (): Store => ({ state: createSampleHousehold(), updateError: null }),
  );
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const hydrated = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate browser-only storage after SSR and report persistence failures. */
  useEffect(() => {
    // Hydrate once after mount so server markup and the first browser render agree.
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const saved = loadHousehold(window.localStorage);
      if (saved) update(saved);
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
        setPantry: (pantry) => update((current) => ({ ...current, pantry })),
        setPreferences: (preferences) =>
          update((current) => ({ ...current, preferences })),
        addMeal: (recipe, servings) => {
          const id = crypto.randomUUID();
          update((current) => ({
            ...current,
            meals: [...current.meals, { id, recipe, servings }],
          }));
        },
        removeMeal: (id) =>
          update((current) => ({
            ...current,
            meals: current.meals.filter((meal) => meal.id !== id),
          })),
        setMealServings: (id, servings) =>
          update((current) => ({
            ...current,
            meals: current.meals.map((meal) =>
              meal.id === id ? { ...meal, servings } : meal,
            ),
          })),
        reset: () => {
          setStorageError(null);
          update(createSampleHousehold());
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
