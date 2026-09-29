import type { DietaryNeed } from "@/lib/contracts";

export const dietaryPatterns: DietaryNeed[] = [
  "vegan",
  "vegetarian",
  "pescatarian",
  "flexitarian",
  "omnivore",
];

export type DietarySelectionResult = {
  values: DietaryNeed[];
  replaced?: DietaryNeed;
};

/** Keep one primary eating pattern while allowing restriction modifiers to stack. */
export function updateDietarySelection(
  current: DietaryNeed[],
  selected: DietaryNeed,
): DietarySelectionResult {
  if (current.includes(selected)) {
    return { values: current.filter((value) => value !== selected) };
  }
  if (!dietaryPatterns.includes(selected)) {
    return { values: [...current, selected] };
  }
  const replaced = current.find((value) => dietaryPatterns.includes(value));
  return {
    values: [
      ...current.filter((value) => !dietaryPatterns.includes(value)),
      selected,
    ],
    replaced,
  };
}

export function normalizeDietaryNeeds(values: DietaryNeed[]): DietaryNeed[] {
  const primary = values.find((value) => dietaryPatterns.includes(value));
  return values.filter(
    (value) => !dietaryPatterns.includes(value) || value === primary,
  );
}
