import assert from "node:assert/strict";
import test from "node:test";
import type { PlannedMeal, Recipe } from "@/lib/contracts";
import {
  addDays,
  calendarDates,
  fillCalendar,
  localDate,
  nextWeekStart,
} from "./calendar";

function recipe(id: string): Recipe {
  return {
    id,
    name: id,
    description: "A meal",
    servings: 2,
    minutes: 20,
    ingredients: [
      { ingredientId: "rice", name: "Rice", quantity: 150, unit: "g" },
    ],
    steps: ["Cook the rice."],
  };
}

function ids() {
  let index = 0;
  return () => `new-${index++}`;
}

test("calendar arithmetic crosses DST, leap days, months, and years as date-only values", () => {
  assert.equal(addDays("2026-03-07", 2), "2026-03-09");
  assert.equal(addDays("2026-10-31", 2), "2026-11-02");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.deepEqual(calendarDates("2026-09-29", 3), [
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
  ]);
  assert.throws(() => addDays("2026-02-29", 1));
  assert.throws(() => calendarDates("2026-09-29", 29));
  assert.throws(() => calendarDates("2026-09-29", 0));
});

test("initial calendar begins next Monday using the user's local day", () => {
  assert.equal(localDate(new Date(2026, 8, 29, 23, 59)), "2026-09-29");
  assert.equal(nextWeekStart(new Date(2026, 8, 29, 23, 59)), "2026-10-05");
  assert.equal(nextWeekStart(new Date(2026, 9, 4, 23, 59)), "2026-10-05");
  assert.equal(nextWeekStart(new Date(2026, 9, 5, 0, 0)), "2026-10-12");
});

test("fill preserves occupied slots, inbox, and other dates while reaching the selected target chronologically", () => {
  const meals: PlannedMeal[] = [
    {
      id: "old",
      recipe: recipe("old"),
      servings: 4,
      date: "2026-10-05",
      slot: "lunch",
    },
    {
      id: "outside",
      recipe: recipe("outside"),
      servings: 2,
      date: "2026-10-12",
      slot: "dinner",
    },
    { id: "inbox", recipe: recipe("inbox"), servings: 2 },
  ];
  const result = fillCalendar({
    meals,
    dates: ["2026-10-06", "2026-10-05", "2026-10-05"],
    slots: ["dinner", "lunch", "breakfast"],
    recipes: [recipe("new")],
    servings: 3,
    target: 4,
    strategy: "repeat",
    idFactory: ids(),
  });
  assert.deepEqual(result.slice(0, 3), meals);
  assert.deepEqual(
    result
      .slice(3)
      .map(({ date, slot, servings }) => ({ date, slot, servings })),
    [
      { date: "2026-10-05", slot: "breakfast", servings: 3 },
      { date: "2026-10-05", slot: "dinner", servings: 3 },
      { date: "2026-10-06", slot: "breakfast", servings: 3 },
    ],
  );
  assert.equal(meals.length, 3);
  result[3].recipe.ingredients[0].quantity = 999;
  assert.equal(result[4].recipe.ingredients[0].quantity, 150);
});

test("unique fill avoids duplicates in this selection but reuses recipes from other weeks and slots", () => {
  const result = fillCalendar({
    meals: [
      {
        id: "old",
        recipe: recipe("rice"),
        servings: 2,
        date: "2026-10-05",
        slot: "lunch",
      },
      {
        id: "previous-week",
        recipe: recipe("soup"),
        servings: 2,
        date: "2026-09-28",
        slot: "lunch",
      },
      {
        id: "other-slot",
        recipe: recipe("salad"),
        servings: 2,
        date: "2026-10-05",
        slot: "breakfast",
      },
      { id: "inbox", recipe: recipe("toast"), servings: 2 },
    ],
    dates: calendarDates("2026-10-05", 7),
    slots: ["lunch"],
    recipes: [
      recipe("rice"),
      recipe("soup"),
      recipe("soup"),
      recipe("salad"),
      recipe("toast"),
    ],
    servings: 2,
    target: 7,
    strategy: "unique",
    idFactory: ids(),
  });
  assert.deepEqual(
    result.slice(4).map((meal) => meal.recipe.id),
    ["soup", "salad", "toast"],
  );
  assert.deepEqual(
    result.slice(4).map((meal) => meal.date),
    ["2026-10-06", "2026-10-07", "2026-10-08"],
  );
});

test("repeat fill places the same recipe in the next three lunches", () => {
  const result = fillCalendar({
    meals: [],
    dates: calendarDates("2026-10-05", 7),
    slots: ["lunch"],
    recipes: [recipe("rice"), recipe("soup")],
    servings: 4,
    target: 3,
    strategy: "repeat",
    idFactory: ids(),
  });
  assert.deepEqual(
    result.map((meal) => [meal.date, meal.slot, meal.recipe.id]),
    [
      ["2026-10-05", "lunch", "rice"],
      ["2026-10-06", "lunch", "rice"],
      ["2026-10-07", "lunch", "rice"],
    ],
  );
});

test("fill respects the total fifty-meal cap and rejects overlapping IDs atomically", () => {
  const meals = Array.from({ length: 49 }, (_, i) => ({
    id: `old-${i}`,
    recipe: recipe("rice"),
    servings: 2,
  }));
  const input = {
    meals,
    dates: calendarDates("2026-10-05", 7),
    slots: ["lunch" as const],
    recipes: [recipe("rice")],
    servings: 2,
    target: 3,
    strategy: "repeat" as const,
    idFactory: ids(),
  };
  assert.equal(fillCalendar(input).length, 50);
  assert.throws(() => fillCalendar({ ...input, idFactory: () => "old-0" }));
  assert.equal(meals.length, 49);
  assert.deepEqual(fillCalendar({ ...input, recipes: [] }), meals);
});
