"use client";

import type { DragEvent } from "react";
import {
  ArrowRight,
  Bookmark,
  GripVertical,
  LoaderCircle,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import type { MealSlot, Recipe, RecipeSource } from "@/lib/contracts";

export type CalendarRecipeSource = "ideas" | "box" | "chat";
export type CalendarFillStrategy = "unique" | "repeat";
export type CalendarRecipeChoice = {
  recipe: Recipe;
  servings: number;
  source: RecipeSource;
};

function sourceLabel(choice: CalendarRecipeChoice) {
  const source = choice.recipe.provenance?.source ?? choice.source;
  return source === "import" ? "Imported" : source === "demo" ? "Demo" : "AI";
}

type CalendarRecipeTrayProps = {
  source: CalendarRecipeSource;
  onSourceChange: (source: CalendarRecipeSource) => void;
  search: string;
  onSearchChange: (search: string) => void;
  choices: CalendarRecipeChoice[];
  suggestionSource?: RecipeSource;
  selectedRecipeId?: string;
  canRepeat: boolean;
  onSelectRecipe: (choice: CalendarRecipeChoice) => void;
  onRecipeDragStart: (event: DragEvent, choice: CalendarRecipeChoice) => void;
  onRecipeDragEnd: () => void;
  loading: boolean;
  error?: string;
  onRefresh: () => void;
  strategy: CalendarFillStrategy;
  onStrategyChange: (strategy: CalendarFillStrategy) => void;
  fillSlot: MealSlot | "all";
  onFillSlotChange: (slot: MealSlot | "all") => void;
  slots: MealSlot[];
  slotNames: Record<MealSlot, string>;
  targetMeals: number;
  onFill: () => void;
  onExplore: () => void;
  onDiscuss: () => void;
};

export function CalendarRecipeTray({
  source,
  onSourceChange,
  search,
  onSearchChange,
  choices,
  suggestionSource,
  selectedRecipeId,
  canRepeat,
  onSelectRecipe,
  onRecipeDragStart,
  onRecipeDragEnd,
  loading,
  error,
  onRefresh,
  strategy,
  onStrategyChange,
  fillSlot,
  onFillSlotChange,
  slots,
  slotNames,
  targetMeals,
  onFill,
  onExplore,
  onDiscuss,
}: CalendarRecipeTrayProps) {
  return (
    <aside className="calendar-library" aria-label="Recipe tray">
      <div className="section-heading">
        <h3>Pick something good</h3>
        <Bookmark size={17} aria-hidden="true" />
      </div>
      <div
        className="calendar-source-tabs"
        role="group"
        aria-label="Calendar recipe source"
      >
        {(
          [
            ["ideas", "Ideas", Sparkles],
            ["box", "Recipe box", Bookmark],
            ["chat", "From chat", MessageCircle],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            aria-pressed={source === id}
            onClick={() => {
              onSourceChange(id);
              onSearchChange("");
            }}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <p className="calendar-help">
        {source === "ideas"
          ? suggestionSource === undefined
            ? "Meal ideas from your kitchen."
            : suggestionSource === "ai"
            ? "AI ideas from your kitchen."
            : "Demo ideas · sample recipes, no live AI."
          : source === "box"
            ? "Your saved recipes, ready for another week."
            : "Recipes proposed in your conversations."}
      </p>
      <label className="calendar-search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Search calendar recipes</span>
        <input
          placeholder="Find a recipe…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <div
        className="calendar-library-list"
        aria-busy={source === "ideas" && loading}
      >
        {source === "ideas" && loading ? (
          <div className="calendar-library-empty" role="status">
            <LoaderCircle className="spinning" size={22} aria-hidden="true" />
            Finding meal ideas…
          </div>
        ) : source === "ideas" && error ? (
          <div className="calendar-library-empty">
            <p role="alert">{error}</p>
            <button className="button secondary" onClick={onRefresh}>
              Try again
            </button>
          </div>
        ) : choices.length ? (
          choices.map((choice) => (
            <button
              key={choice.recipe.id}
              className="calendar-recipe"
              draggable
              onDragStart={(event) => onRecipeDragStart(event, choice)}
              onDragEnd={onRecipeDragEnd}
              aria-pressed={selectedRecipeId === choice.recipe.id}
              onClick={() => onSelectRecipe(choice)}
            >
              <GripVertical size={15} aria-hidden="true" />
              <span>
                <span className="calendar-recipe-name">
                  {choice.recipe.name}
                </span>
                <span className="calendar-recipe-meta">
                  {choice.recipe.minutes} min · {choice.servings} servings ·{" "}
                  {sourceLabel(choice)}
                </span>
              </span>
              <Plus size={14} aria-hidden="true" />
            </button>
          ))
        ) : (
          <div className="calendar-library-empty">
            <p>
              {search
                ? "No recipes match that search."
                : source === "box"
                  ? "Save a recipe from Suggestions or Chat to keep it here."
                  : source === "chat"
                    ? "Talk through a few ideas in Chat, then arrange them here."
                    : "No recipes fit your preferences. Try more cooking time in Suggestions."}
            </p>
            <button className="text-button" onClick={onExplore}>
              {source === "chat" ? "Open chat" : "Explore suggestions"}{" "}
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <p className="calendar-help">
        Drag a recipe onto the week, or select one and tap an empty slot.
      </p>
      <div className="calendar-fill-controls">
        <h3>A head start</h3>
        <label className="field">
          How should we fill it?
          <select
            aria-label="Fill strategy"
            value={strategy}
            onChange={(event) =>
              onStrategyChange(event.target.value as CalendarFillStrategy)
            }
          >
            <option value="unique">Different recipes</option>
            <option value="repeat">Repeat selected recipe</option>
          </select>
        </label>
        <label className="field">
          Plan for
          <select
            aria-label="Slots to fill"
            value={fillSlot}
            onChange={(event) =>
              onFillSlotChange(event.target.value as MealSlot | "all")
            }
          >
            <option value="all">All selected meal slots</option>
            {slots.map((slot) => (
              <option key={slot} value={slot}>
                {slotNames[slot]} only
              </option>
            ))}
          </select>
        </label>
        <button
          className="button calendar-fill-button"
          onClick={onFill}
          disabled={
            (source === "ideas" && loading) ||
            (strategy === "repeat" ? !canRepeat : !choices.length)
          }
        >
          <Sparkles size={15} aria-hidden="true" />
          Fill open slots
        </button>
        <p className="calendar-help">
          Up to {targetMeals} meals in this range
          {fillSlot === "all" ? "" : `, for ${fillSlot}`}. Existing meals
          stay put. Different recipes never repeat; a small recipe pool may
          leave slots open.
        </p>
        <button
          className="text-button"
          onClick={onDiscuss}
        >
          <MessageCircle size={14} aria-hidden="true" />
          Talk through ideas
        </button>
      </div>
    </aside>
  );
}
