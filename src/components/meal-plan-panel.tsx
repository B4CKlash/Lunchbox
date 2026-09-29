"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  MessageCircle,
  Plus,
  X,
} from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import {
  CalendarRecipeTray,
  type CalendarRecipeChoice,
  type CalendarRecipeSource,
  type CalendarFillStrategy,
} from "@/components/calendar-recipe-tray";
import { RecipeDetails } from "@/components/recipe-card";
import {
  addDays,
  calendarDates,
  fillCalendar,
  localDate,
  nextWeekStart,
} from "@/features/planning/calendar";
import type { MealSlot, SuggestMealsResponse } from "@/lib/contracts";

const slots: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
const slotNames: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
};
const dragType = "application/x-lunchbox-meal";
type Selection =
  | { kind: "recipe"; choice: CalendarRecipeChoice }
  | { kind: "meal"; id: string };
function dateLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", options);
}

export function MealPlanPanel({
  onNotice,
  suggestions,
  loading,
  error,
  onRefresh,
}: {
  onNotice: (message: string) => void;
  suggestions?: SuggestMealsResponse;
  loading: boolean;
  error?: string;
  onRefresh: () => void;
}) {
  const {
    state,
    ready,
    setCalendarSettings,
    setCalendarDraft,
    commitCalendar,
    discardCalendarDraft,
    setWorkspaceMode,
    setChatDraft,
    clearRecipeFocus,
    setMealServings,
    removeMeal,
    discussRecipe,
  } = useHousehold();
  const [source, setSource] = useState<CalendarRecipeSource>("ideas");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<CalendarFillStrategy>("unique");
  const [fillSlot, setFillSlot] = useState<MealSlot | "all">("all");
  const [repeatCount, setRepeatCount] = useState(2);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (!ready)
    return (
      <div className="card empty-state" role="status">
        Loading your calendar…
      </div>
    );

  const calendar = state.workspace.calendar;
  const start = calendar.startDate ?? nextWeekStart();
  const dates = calendarDates(start, calendar.days);
  const meals = calendar.draft ?? state.meals;
  const dirty = calendar.draft !== null;
  const effectiveFillSlot =
    fillSlot === "all" || calendar.slots.includes(fillSlot) ? fillSlot : "all";
  const today = localDate(new Date());
  const visibleSlots = slots.filter(
    (slot) =>
      calendar.slots.includes(slot) ||
      meals.some(
        (meal) => meal.slot === slot && meal.date && dates.includes(meal.date),
      ),
  );
  const scheduled = meals.filter((meal) => meal.date && meal.slot);
  const inbox = meals.filter((meal) => !meal.date);
  const inRange = scheduled.filter((meal) => dates.includes(meal.date!));
  const outside = scheduled.filter((meal) => !dates.includes(meal.date!));
  const selectedMeal =
    selection?.kind === "meal"
      ? meals.find((meal) => meal.id === selection.id)
      : undefined;
  const selectedChoice =
    selection?.kind === "recipe" ? selection.choice : undefined;
  const selectedRecipe = selectedChoice?.recipe ?? selectedMeal?.recipe;
  const choices: CalendarRecipeChoice[] =
    source === "ideas"
      ? (suggestions?.recipes ?? []).map((recipe) => ({
          recipe,
          source: suggestions!.source,
          servings: state.preferences.servings,
        }))
      : source === "box"
        ? state.workspace.recipeBox.map((entry) => ({
            ...entry,
            servings: state.preferences.servings,
          }))
        : [
            ...new Map(
              state.workspace.chatMessages
                .filter((message) => message.role === "assistant")
                .flatMap((message) =>
                  message.recipes.map(
                    (recipe) =>
                      [
                        recipe.id,
                        {
                          recipe,
                          servings: message.servings,
                          source: message.source ?? "demo",
                        },
                      ] as const,
                  ),
                ),
            ).values(),
          ];
  const filtered = choices.filter(({ recipe }) =>
    recipe.name.toLowerCase().includes(search.toLowerCase()),
  );
  const byCell = new Map(
    scheduled.map((meal) => [`${meal.date}:${meal.slot}`, meal]),
  );

  function beginDrag(event: DragEvent, item: Selection) {
    setSelection(item);
    event.dataTransfer.setData(
      dragType,
      JSON.stringify(
        item.kind === "meal"
          ? { kind: "meal", id: item.id }
          : { kind: "recipe", id: item.choice.recipe.id },
      ),
    );
    event.dataTransfer.effectAllowed = item.kind === "meal" ? "move" : "copy";
  }

  function place(item: Selection | null, date: string, slot: MealSlot) {
    if (!item) {
      onNotice("Choose a recipe from the tray, then tap a calendar slot.");
      return;
    }
    const occupied = byCell.get(`${date}:${slot}`);
    if (item.kind === "recipe") {
      if (occupied) {
        onNotice("That slot already has a meal. Move or remove it first.");
        return;
      }
      if (meals.length >= 50) {
        onNotice("Your calendar holds 50 meals. Remove a meal to make room.");
        return;
      }
      setCalendarDraft([
        ...meals,
        {
          id: crypto.randomUUID(),
          recipe: item.choice.recipe,
          servings: item.choice.servings,
          date,
          slot,
        },
      ]);
      onNotice(
        `${item.choice.recipe.name} added to ${slotNames[slot].toLowerCase()} on ${dateLabel(date, { month: "short", day: "numeric" })}. Draft only.`,
      );
    } else {
      const moving = meals.find((meal) => meal.id === item.id);
      if (!moving || moving.id === occupied?.id) return;
      setCalendarDraft(
        meals.map((meal) =>
          meal.id === moving.id
            ? { ...meal, date, slot }
            : meal.id === occupied?.id
              ? { ...meal, date: moving.date, slot: moving.slot }
              : meal,
        ),
      );
      onNotice(
        occupied
          ? "Meals swapped. Commit when you’re happy with the plan."
          : "Meal moved. Your grocery list is unchanged until you commit.",
      );
    }
  }

  function drop(event: DragEvent, date: string, slot: MealSlot) {
    event.preventDefault();
    setDragOver(null);
    try {
      const payload = JSON.parse(event.dataTransfer.getData(dragType));
      if (
        payload.kind === "meal" &&
        meals.some((meal) => meal.id === payload.id)
      )
        place({ kind: "meal", id: payload.id }, date, slot);
      if (payload.kind === "recipe") {
        const choice = choices.find((entry) => entry.recipe.id === payload.id);
        if (choice) place({ kind: "recipe", choice }, date, slot);
      }
    } catch {
      onNotice("Choose a recipe from the tray to place it on the calendar.");
    }
  }

  function fill() {
    const fillDates = dates;
    const chosenSlots = effectiveFillSlot === "all" ? calendar.slots : [effectiveFillSlot];
    const recipePool =
      strategy === "repeat"
        ? selectedRecipe
          ? [selectedRecipe]
          : []
        : filtered.map((entry) => entry.recipe);
    if (!recipePool.length) {
      onNotice(
        strategy === "repeat"
          ? "Choose a recipe to repeat first."
          : "This source has no recipes to fill the calendar with.",
      );
      return;
    }
    const next = fillCalendar({
      meals,
      dates: fillDates,
      slots: chosenSlots,
      recipes: recipePool,
      servings:
        selectedChoice?.servings ??
        selectedMeal?.servings ??
        state.preferences.servings,
      target: calendar.targetMeals,
      strategy,
      idFactory: () => crypto.randomUUID(),
    });
    // Preserve the portions proposed by chat for each distinct recipe.
    const portions = new Map(
      filtered.map((choice) => [choice.recipe.id, choice.servings]),
    );
    const previousIds = new Set(meals.map((meal) => meal.id));
    const result = next.map((meal) =>
      strategy === "unique" && !previousIds.has(meal.id)
        ? { ...meal, servings: portions.get(meal.recipe.id) ?? meal.servings }
        : meal,
    );
    const added = result.length - meals.length;
    if (added) setCalendarDraft(result);
    onNotice(
      added
        ? `Added ${added} ${added === 1 ? "meal" : "meals"} to your draft. ${strategy === "unique" ? "Each recipe is different; add more recipes if you still have open slots." : "Only empty slots were filled."}`
        : "No meals added. Your target may be met, slots may be full, or you may need more unique recipes.",
    );
  }

  function repeatMeal() {
    if (!selectedMeal?.date || !selectedMeal.slot) return;
    const futureDates = dates.filter((date) => date > selectedMeal.date!);
    const occupiedCount = meals.filter(
      (meal) =>
        meal.date &&
        futureDates.includes(meal.date) &&
        meal.slot === selectedMeal.slot,
    ).length;
    const next = fillCalendar({
      meals,
      dates: futureDates,
      slots: [selectedMeal.slot],
      recipes: [selectedMeal.recipe],
      servings: selectedMeal.servings,
      target: occupiedCount + repeatCount,
      strategy: "repeat",
      idFactory: () => crypto.randomUUID(),
    });
    const added = next.length - meals.length;
    if (added) setCalendarDraft(next);
    onNotice(
      `Added ${added} of ${repeatCount} repeats to later empty ${selectedMeal.slot} slots. ${added < repeatCount ? "Add more days for more room." : "Your grocery list stays unchanged until you commit."}`,
    );
  }

  return (
    <section className="calendar-workspace" aria-labelledby="plan-heading">
      <div className="calendar-topbar">
        <div>
          <p className="eyebrow">MAKE ROOM FOR GOOD FOOD</p>
          <h2 id="plan-heading">Your calendar</h2>
          <p className="calendar-help">
            Arrange a little. Change your mind. Commit when it feels right.
          </p>
        </div>
        <span className="calendar-state">
          <span className="status-dot" />
          {dirty ? "Draft changes" : "Plan up to date"}
        </span>
      </div>
      <div className="calendar-settings">
        <div className="calendar-settings-fields">
          <label className="field">
            Starting on
            <input
              aria-label="Calendar start date"
              type="date"
              value={start}
              onChange={(event) => {
                if (
                  event.target.value &&
                  /^\d{4}-\d{2}-\d{2}$/.test(event.target.value)
                )
                  setCalendarSettings({ startDate: event.target.value });
              }}
            />
          </label>
          <label className="field">
            Meals to plan
            <select
              value={calendar.targetMeals}
              onChange={(event) =>
                setCalendarSettings({ targetMeals: Number(event.target.value) })
              }
            >
              {Array.from({ length: 50 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} {i === 0 ? "meal" : "meals"}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="calendar-slot-toggles">
            <legend>Meal slots</legend>
            {slots.map((slot) => (
              <label key={slot}>
                <input
                  type="checkbox"
                  checked={calendar.slots.includes(slot)}
                  disabled={
                    calendar.slots.length === 1 && calendar.slots.includes(slot)
                  }
                  onChange={(event) =>
                    setCalendarSettings({
                      slots: slots.filter((value) =>
                        value === slot
                          ? event.target.checked
                          : calendar.slots.includes(value),
                      ),
                    })
                  }
                />
                {slotNames[slot]}
              </label>
            ))}
          </fieldset>
        </div>
        <p className="calendar-help">
          Start with the next week. Add days as you go. Occupied meal slots stay
          visible.
        </p>
      </div>
      <div className="calendar-layout">
        <CalendarRecipeTray
          source={source}
          onSourceChange={setSource}
          search={search}
          onSearchChange={setSearch}
          choices={filtered}
          suggestionSource={suggestions?.source}
          selectedRecipeId={selectedChoice?.recipe.id}
          canRepeat={Boolean(selectedRecipe)}
          onSelectRecipe={(choice) => setSelection({ kind: "recipe", choice })}
          onRecipeDragStart={(event, choice) =>
            beginDrag(event, { kind: "recipe", choice })
          }
          onRecipeDragEnd={() => setDragOver(null)}
          loading={loading}
          error={error}
          onRefresh={onRefresh}
          strategy={strategy}
          onStrategyChange={setStrategy}
          fillSlot={effectiveFillSlot}
          onFillSlotChange={setFillSlot}
          slots={calendar.slots}
          slotNames={slotNames}
          targetMeals={calendar.targetMeals}
          onFill={fill}
          onExplore={() =>
            setWorkspaceMode(source === "chat" ? "chat" : "suggestions")
          }
          onDiscuss={() => {
            clearRecipeFocus();
            if (!state.workspace.chatDraft)
              setChatDraft("What can I make tonight?");
            setWorkspaceMode("chat");
          }}
        />
        <div className="calendar-main">
          <div className="calendar-range">
            <div className="actions">
              <button
                className="icon-button"
                aria-label="Previous week"
                onClick={() =>
                  setCalendarSettings({ startDate: addDays(start, -7) })
                }
              >
                <ChevronLeft size={19} aria-hidden="true" />
              </button>
              <button
                className="icon-button"
                aria-label="Next week"
                onClick={() =>
                  setCalendarSettings({ startDate: addDays(start, 7) })
                }
              >
                <ChevronRight size={19} aria-hidden="true" />
              </button>
              <h3>
                {dateLabel(start, { month: "short", day: "numeric" })} –{" "}
                {dateLabel(dates.at(-1)!, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </h3>
            </div>
            <div className="actions">
              <button
                className="text-button"
                onClick={() =>
                  setCalendarSettings({ startDate: nextWeekStart(), days: 7 })
                }
              >
                Upcoming week
              </button>
              <button
                className="button secondary"
                disabled={calendar.days >= 28}
                onClick={() => setCalendarSettings({ days: calendar.days + 1 })}
              >
                <Plus size={14} aria-hidden="true" />
                Add day
              </button>
            </div>
          </div>
          <div className="calendar-target">
            <span>
              <strong>{inRange.length}</strong> / {calendar.targetMeals} meals
              planned · {calendar.days} days
            </span>
            <span>{state.preferences.servings} servings by default</span>
          </div>
          {inbox.length ? (
            <section
              className="calendar-inbox"
              aria-label="Unscheduled recipes"
            >
              <h3>
                Ready to place{" "}
                <span className="count-badge">{inbox.length}</span>
              </h3>
              <p className="calendar-help">
                These recipes need a day and meal slot before you commit.
              </p>
              <div className="calendar-inbox-list">
                {inbox.map((meal) => (
                  <button
                    key={meal.id}
                    className="calendar-recipe"
                    draggable
                    aria-pressed={selectedMeal?.id === meal.id}
                    onDragStart={(event) =>
                      beginDrag(event, { kind: "meal", id: meal.id })
                    }
                    onClick={() => setSelection({ kind: "meal", id: meal.id })}
                  >
                    <GripVertical size={14} aria-hidden="true" />
                    <span className="calendar-recipe-name">
                      {meal.recipe.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <div className="calendar-selected-note" role="status">
            {selectedRecipe ? (
              <>
                <Check size={14} aria-hidden="true" />
                <span>
                  {selectedRecipe.name} selected.{" "}
                  {selectedMeal
                    ? "Tap a slot to move it, or edit below."
                    : "Tap an empty slot to add it."}
                </span>
                <button
                  className="icon-button"
                  aria-label="Clear selection"
                  onClick={() => setSelection(null)}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <CalendarDays size={15} aria-hidden="true" />
                Your calendar is a playground. Pick a recipe to get started.
              </>
            )}
          </div>
          <div
            className="calendar-grid-scroll"
            tabIndex={0}
            role="region"
            aria-label="Meal calendar; scroll horizontally for more days"
          >
            <div
              className="calendar-grid"
              role="table"
              aria-label="Meal planning calendar"
              style={{
                gridTemplateColumns: `76px repeat(${dates.length}, minmax(105px, 1fr))`,
              }}
            >
              <div role="row" style={{ display: "contents" }}>
                <div className="calendar-corner" role="columnheader">
                  <CalendarDays size={17} aria-hidden="true" />
                  <span className="sr-only">Meal slot</span>
                </div>
                {dates.map((date) => (
                  <div
                    role="columnheader"
                    className={`calendar-day-header${date === today ? " today" : ""}`}
                    key={date}
                  >
                    <span>{dateLabel(date, { weekday: "short" })}</span>
                    <strong>{dateLabel(date, { day: "numeric" })}</strong>
                  </div>
                ))}
              </div>
              {visibleSlots.map((slot) => (
                <div key={slot} role="row" style={{ display: "contents" }}>
                  <div
                    className="calendar-row-label"
                    data-slot={slot}
                    role="rowheader"
                  >
                    <span className="slot-dot" />
                    {slotNames[slot]}
                  </div>
                  {dates.map((date) => {
                    const key = `${date}:${slot}`;
                    const meal = byCell.get(key);
                    const label = `${slotNames[slot]}, ${dateLabel(date, { weekday: "long", month: "short", day: "numeric" })}`;
                    return (
                      <div
                        key={key}
                        role="cell"
                        data-slot={slot}
                        data-date={date}
                        className={`calendar-cell${meal ? " has-meal" : ""}${dragOver === key ? " drag-over" : ""}`}
                        onDragOver={(event) => {
                          if (event.dataTransfer.types.includes(dragType)) {
                            event.preventDefault();
                            setDragOver(key);
                          }
                        }}
                        onDragLeave={(event) => {
                          if (
                            !event.currentTarget.contains(
                              event.relatedTarget as Node | null,
                            )
                          )
                            setDragOver(null);
                        }}
                        onDrop={(event) => drop(event, date, slot)}
                      >
                        {meal ? (
                          <article
                            className={`calendar-event${selectedMeal?.id === meal.id ? " selected" : ""}`}
                            data-slot={slot}
                            draggable
                            onDragStart={(event) =>
                              beginDrag(event, { kind: "meal", id: meal.id })
                            }
                            onDragEnd={() => setDragOver(null)}
                          >
                            <button
                              className="calendar-event-select"
                              aria-label={`Edit ${meal.recipe.name}, ${label}`}
                              aria-pressed={selectedMeal?.id === meal.id}
                              onClick={() =>
                                setSelection({ kind: "meal", id: meal.id })
                              }
                            >
                              {meal.recipe.name}
                              <span className="calendar-event-meta">
                                {meal.servings} servings · {meal.recipe.minutes}{" "}
                                min
                              </span>
                            </button>
                            <div className="calendar-event-actions">
                              <GripVertical size={12} aria-hidden="true" />
                              {selection?.kind === "meal" &&
                              selectedMeal?.id !== meal.id ? (
                                <button
                                  className="text-button"
                                  aria-label={`Swap selected meal with ${label}`}
                                  onClick={() => place(selection, date, slot)}
                                >
                                  Swap
                                </button>
                              ) : (
                                <span>{slotNames[slot]}</span>
                              )}
                              <button
                                className="icon-button"
                                aria-label={`Remove ${meal.recipe.name}, ${label}`}
                                onClick={() => {
                                  removeMeal(meal.id);
                                  if (selectedMeal?.id === meal.id)
                                    setSelection(null);
                                  onNotice(
                                    "Meal removed from the draft. Commit to update your grocery list.",
                                  );
                                }}
                              >
                                <X size={13} aria-hidden="true" />
                              </button>
                            </div>
                          </article>
                        ) : (
                          <button
                            className="calendar-empty-slot"
                            aria-label={`${selection ? "Place selected recipe" : "Choose a recipe"} for ${label}`}
                            onClick={() => place(selection, date, slot)}
                          >
                            <Plus size={17} aria-hidden="true" />
                            <span>{selection ? "Place here" : "Add meal"}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="calendar-help">
            Drag meals to move them. Drop one onto another to swap. On touch or
            keyboard, select a meal and use the slot buttons or editor below.
          </p>
          {outside.length ? (
            <div className="calendar-unscheduled">
              <p>
                {outside.length} scheduled{" "}
                {outside.length === 1 ? "meal is" : "meals are"} outside this
                view. Committing includes all {scheduled.length} scheduled
                meals.
              </p>
              <button
                className="text-button"
                onClick={() =>
                  setCalendarSettings({ startDate: outside[0].date! })
                }
              >
                Show other meals <ArrowRight size={13} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {selectedMeal ? (
            <section
              className="calendar-editor"
              aria-label="Edit selected meal"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">MAKE IT FIT</p>
                  <h3>{selectedMeal.recipe.name}</h3>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close meal editor"
                  onClick={() => setSelection(null)}
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
              <div className="calendar-editor-fields">
                <label className="field">
                  Day
                  <select
                    aria-label="Selected meal day"
                    value={selectedMeal.date ?? ""}
                    onChange={(event) =>
                      place(
                        { kind: "meal", id: selectedMeal.id },
                        event.target.value,
                        selectedMeal.slot ?? calendar.slots[0],
                      )
                    }
                  >
                    {!selectedMeal.date ? (
                      <option value="" disabled>
                        Choose a day
                      </option>
                    ) : null}
                    {[
                      ...new Set([
                        ...dates,
                        ...(selectedMeal.date ? [selectedMeal.date] : []),
                      ]),
                    ]
                      .sort()
                      .map((date) => (
                        <option key={date} value={date}>
                          {dateLabel(date, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Meal
                  <select
                    aria-label="Selected meal slot"
                    value={selectedMeal.slot ?? calendar.slots[0]}
                    onChange={(event) =>
                      place(
                        { kind: "meal", id: selectedMeal.id },
                        selectedMeal.date ?? start,
                        event.target.value as MealSlot,
                      )
                    }
                  >
                    {slots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slotNames[slot]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Servings
                  <select
                    aria-label="Selected meal servings"
                    value={selectedMeal.servings}
                    onChange={(event) =>
                      setMealServings(
                        selectedMeal.id,
                        Number(event.target.value),
                      )
                    }
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Repeat into next
                  <select
                    aria-label="Number of repeats"
                    value={repeatCount}
                    onChange={(event) =>
                      setRepeatCount(Number(event.target.value))
                    }
                  >
                    {Array.from({ length: 14 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1} empty {selectedMeal.slot ?? "meal"}{" "}
                        {i === 0 ? "slot" : "slots"}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={!selectedMeal.date}
                  onClick={repeatMeal}
                >
                  Repeat meal
                </button>
              </div>
              <RecipeDetails
                recipe={selectedMeal.recipe}
                servings={selectedMeal.servings}
              />
              <div className="actions">
                <button
                  className="text-button"
                  onClick={() =>
                    discussRecipe(selectedMeal.recipe, selectedMeal.servings)
                  }
                >
                  <MessageCircle size={14} aria-hidden="true" />
                  Discuss recipe
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    removeMeal(selectedMeal.id);
                    setSelection(null);
                  }}
                >
                  Remove from draft
                </button>
              </div>
            </section>
          ) : null}
          {selectedChoice ? (
            <section
              className="calendar-editor"
              aria-label="Selected recipe details"
            >
              <h3>{selectedChoice.recipe.name}</h3>
              <p className="calendar-help">
                {selectedChoice.recipe.description}
              </p>
              <RecipeDetails
                recipe={selectedChoice.recipe}
                servings={selectedChoice.servings}
              />
            </section>
          ) : null}
        </div>
      </div>
      <div className="calendar-commit-bar">
        <div>
          <p className="eyebrow">
            {dirty ? "LOOKING GOOD? MAKE IT THE PLAN." : "YOUR COMMITTED PLAN"}
          </p>
          <h3>{scheduled.length} meals, ready for the week.</h3>
          <p>
            {inbox.length
              ? `Place or remove ${inbox.length} unscheduled ${inbox.length === 1 ? "recipe" : "recipes"} before committing.`
              : dirty
                ? "Your grocery list will update from the whole plan. Pantry stock stays as it is."
                : `${state.meals.length} committed meals feed your grocery list. Draft changes stay here until you commit.`}
          </p>
        </div>
        <div className="actions">
          {dirty ? (
            <>
              <button
                className="text-button"
                onClick={() => setConfirmDiscard(!confirmDiscard)}
              >
                {confirmDiscard ? "Keep editing" : "Discard changes"}
              </button>
              <button
                className="button"
                disabled={inbox.length > 0}
                onClick={() => {
                  commitCalendar();
                  setConfirmDiscard(false);
                  onNotice(
                    "Plan committed. Your grocery list now includes these meals.",
                  );
                }}
              >
                <Check size={16} aria-hidden="true" />
                Commit plan
              </button>
            </>
          ) : null}
          <Link className="button secondary" href="/shopping">
            Grocery list <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
      {confirmDiscard && dirty ? (
        <div className="calendar-unscheduled" role="alert">
          <p>Discard your draft and return to the last committed plan?</p>
          <button
            className="button secondary"
            onClick={() => {
              discardCalendarDraft();
              setSelection(null);
              setConfirmDiscard(false);
              onNotice("Draft discarded. Your committed plan is unchanged.");
            }}
          >
            Discard draft
          </button>
        </div>
      ) : null}
    </section>
  );
}
