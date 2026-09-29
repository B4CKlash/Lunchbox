import {
  calendarDateSchema,
  mealSlotSchema,
  plannedMealsSchema,
  recipeSchema,
  type MealSlot,
  type PlannedMeal,
  type Recipe,
} from "@/lib/contracts";

const slotOrder: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];

/** Local calendar date; never derive a user's day from their UTC offset. */
export function localDate(date: Date): string {
  return calendarDateSchema.parse(
    [
      String(date.getFullYear()).padStart(4, "0"),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-"),
  );
}

/** UTC is only an arithmetic container for these date-only values, avoiding DST. */
export function addDays(date: string, days: number): string {
  calendarDateSchema.parse(date);
  if (!Number.isInteger(days)) throw new Error("Use a whole number of days.");
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return calendarDateSchema.parse(value.toISOString().slice(0, 10));
}

export function nextWeekStart(now: Date = new Date()): string {
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  return addDays(localDate(now), daysUntilMonday);
}

export function calendarDates(start: string, days: number): string[] {
  calendarDateSchema.parse(start);
  if (!Number.isInteger(days) || days < 1 || days > 28) {
    throw new Error("Choose between 1 and 28 calendar days.");
  }
  return Array.from({ length: days }, (_, index) => addDays(start, index));
}

type FillCalendarInput = {
  meals: PlannedMeal[];
  dates: string[];
  slots: MealSlot[];
  recipes: Recipe[];
  servings: number;
  target: number;
  strategy: "unique" | "repeat";
  idFactory: () => string;
};

/** Fill empty slots up to a total in this selection, preserving all existing meals. */
export function fillCalendar({
  meals,
  dates,
  slots,
  recipes,
  servings,
  target,
  strategy,
  idFactory,
}: FillCalendarInput): PlannedMeal[] {
  const result = plannedMealsSchema.parse(meals);
  if (!Number.isInteger(target) || target < 1 || target > 50) {
    throw new Error("Choose between 1 and 50 meals.");
  }
  if (!Number.isInteger(servings) || servings < 1 || servings > 12) {
    throw new Error("Choose between 1 and 12 servings.");
  }
  const selectedDates = [
    ...new Set(dates.map((date) => calendarDateSchema.parse(date))),
  ].sort();
  const selectedSlots = new Set(
    slots.map((slot) => mealSlotSchema.parse(slot)),
  );
  const chronologicalSlots = slotOrder.filter((slot) =>
    selectedSlots.has(slot),
  );
  const occupied = new Set(
    result
      .filter((meal) => meal.date && meal.slot)
      .map((meal) => `${meal.date}:${meal.slot}`),
  );
  const selectedMeals = result.filter(
    (meal) =>
      meal.date &&
      meal.slot &&
      selectedDates.includes(meal.date) &&
      selectedSlots.has(meal.slot),
  );
  let scheduled = selectedMeals.length;
  // A different week or meal-slot selection can reuse the same recipe box.
  const usedRecipes = new Set(selectedMeals.map((meal) => meal.recipe.id));
  const candidates = recipes.map((recipe) => recipeSchema.parse(recipe));
  let cursor = 0;

  for (const date of selectedDates) {
    for (const slot of chronologicalSlots) {
      if (scheduled >= target || result.length >= 50)
        return plannedMealsSchema.parse(result);
      if (occupied.has(`${date}:${slot}`)) continue;
      let recipe: Recipe | undefined;
      if (strategy === "repeat") {
        recipe = candidates[0];
      } else {
        while (
          cursor < candidates.length &&
          usedRecipes.has(candidates[cursor].id)
        )
          cursor++;
        recipe = candidates[cursor++];
      }
      if (!recipe) return plannedMealsSchema.parse(result);
      result.push({ id: idFactory(), recipe, servings, date, slot });
      occupied.add(`${date}:${slot}`);
      usedRecipes.add(recipe.id);
      scheduled++;
    }
  }
  return plannedMealsSchema.parse(result);
}
