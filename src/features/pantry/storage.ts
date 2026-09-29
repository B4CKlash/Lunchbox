import { householdStateSchema, type HouseholdState } from "@/lib/contracts";

export const HOUSEHOLD_STORAGE_KEY = "lunchbox.household.v1";

/** Missing, inaccessible, corrupt, and incompatible saves all use the caller's fallback. */
export function loadHousehold(
  storage: Pick<Storage, "getItem">,
): HouseholdState | null {
  try {
    const stored = storage.getItem(HOUSEHOLD_STORAGE_KEY);
    if (stored === null) return null;
    const result = householdStateSchema.safeParse(JSON.parse(stored));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Let write failures reach the UI so it can warn that changes are not saved. */
export function saveHousehold(
  storage: Pick<Storage, "setItem">,
  state: HouseholdState,
): void {
  storage.setItem(
    HOUSEHOLD_STORAGE_KEY,
    JSON.stringify(householdStateSchema.parse(state)),
  );
}
