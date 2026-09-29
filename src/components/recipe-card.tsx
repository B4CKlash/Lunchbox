"use client";

import {
  ArrowRight,
  Bookmark,
  Check,
  Clock3,
  MessageCircle,
  Plus,
  Utensils,
} from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import { buildShoppingList } from "@/features/planning/shopping";
import type { Recipe, RecipeSource } from "@/lib/contracts";

const amount = (quantity: number, unit: string) =>
  `${quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${unit}`;

export function RecipeDetails({
  recipe,
  servings,
}: {
  recipe: Recipe;
  servings: number;
}) {
  return (
    <details className="recipe-details">
      <summary>Ingredients & steps</summary>
      <div className="recipe-ingredients">
        {recipe.ingredients.map((ingredient, index) => (
          <div key={`${ingredient.ingredientId}-${index}`}>
            <span>{ingredient.name}</span>
            <span>
              {amount(
                (ingredient.quantity * servings) / recipe.servings,
                ingredient.unit,
              )}
            </span>
          </div>
        ))}
      </div>
      <ol>
        {recipe.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {recipe.provenance?.source === "import" ? (
        <p className="recipe-attribution">
          {recipe.provenance.sourceUrl ? (
            <a href={recipe.provenance.sourceUrl} target="_blank" rel="noreferrer">
              {recipe.provenance.title || "Original recipe"}
            </a>
          ) : "Imported from recipe text"}
          {recipe.provenance.author ? ` · ${recipe.provenance.author}` : ""}
        </p>
      ) : null}
    </details>
  );
}

/** Every discovery surface uses the same recipe snapshot and household actions. */
export function RecipeCard({
  recipe,
  source,
  servings,
  index = 0,
  onNotice,
}: {
  recipe: Recipe;
  source: RecipeSource;
  servings: number;
  index?: number;
  onNotice: (message: string) => void;
}) {
  const {
    state,
    addMeal,
    saveRecipe,
    removeSavedRecipe,
    discussRecipe,
    setChatDraft,
    setWorkspaceMode,
  } = useHousehold();
  const saved = state.workspace.recipeBox.some(
    (entry) => entry.recipe.id === recipe.id,
  );
  const calendarMeals = state.workspace.calendar.draft ?? state.meals;
  const planned = calendarMeals.filter(
    (meal) => meal.recipe.id === recipe.id,
  ).length;
  const shortages = buildShoppingList(
    state.pantry,
    [{ id: "preview", recipe, servings }],
    { includeRestock: false },
  );
  const ingredientCount = new Set(recipe.ingredients.map(
    (ingredient) => JSON.stringify([ingredient.ingredientId, ingredient.unit]),
  )).size;
  const inStock = ingredientCount - shortages.length;
  const provenance = recipe.provenance ?? { source };
  const snapshot = { ...recipe, provenance };
  return (
    <article
      className={`recipe-card recipe-tone-${index % 3}`}
      aria-label={recipe.name}
    >
      <div className="recipe-cover">
        <span className="recipe-index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="pill">
          {provenance.source === "demo" ? "Sample recipe" : provenance.source === "import" ? "Imported recipe" : "AI recipe"}
        </span>
        <h3>{recipe.name}</h3>
        <div className="recipe-meta">
          <span>
            <Clock3 size={14} aria-hidden="true" />
            {recipe.minutes} min
          </span>
          <span>
            <Utensils size={14} aria-hidden="true" />
            {servings} servings
          </span>
        </div>
      </div>
      <div className="recipe-body">
        <p>{recipe.description}</p>
        <div className="pantry-match">
          <span className="match-dot" />
          {inStock} of {ingredientCount} ingredients on hand
        </div>
        {shortages.length ? (
          <details className="recipe-shortages">
            <summary>{shortages.length} {shortages.length === 1 ? "ingredient" : "ingredients"} to pick up</summary>
            <ul>{shortages.map((item) => (
              <li key={`${item.ingredientId}-${item.unit}`}>
                <span>{item.name}</span><span>{amount(item.quantity, item.unit)}</span>
              </li>
            ))}</ul>
            <p>For this meal alone. Your shopping list combines the whole plan.</p>
          </details>
        ) : null}
        <RecipeDetails recipe={snapshot} servings={servings} />
        <button
          className="button"
          disabled={calendarMeals.length >= 50}
          onClick={() => {
            addMeal(snapshot, servings);
            onNotice(
              `${recipe.name} added to your calendar draft for ${servings} servings. Choose a day, then commit when you’re ready.`,
            );
          }}
        >
          <Plus size={16} aria-hidden="true" />
          Add to calendar
        </button>
        {planned > 0 ? (
          <>
            <p className="recipe-planned">
              <Check size={12} aria-hidden="true" />
              In your calendar {planned > 1 ? `× ${planned}` : ""}
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => setWorkspaceMode("plan")}
            >
              Open calendar <ArrowRight size={14} aria-hidden="true" />
            </button>
          </>
        ) : null}
        <div className="recipe-secondary-actions">
          <button
            className="text-button"
            aria-pressed={saved}
            disabled={!saved && state.workspace.recipeBox.length >= 100}
            onClick={() => {
              if (saved) removeSavedRecipe(recipe.id);
              else saveRecipe(snapshot, provenance.source);
              onNotice(
                saved
                  ? `${recipe.name} removed from your recipe box.`
                  : `${recipe.name} saved to your recipe box.`,
              );
            }}
          >
            <Bookmark size={14} aria-hidden="true" />
            {saved ? "Saved" : "Save recipe"}
          </button>
          <button
            className="text-button"
            onClick={() => {
              discussRecipe(snapshot, servings);
              if (!state.workspace.chatDraft)
                setChatDraft("What do I need for this recipe?");
              requestAnimationFrame(() =>
                document.getElementById("meal-message")?.focus(),
              );
            }}
          >
            <MessageCircle size={14} aria-hidden="true" />
            Discuss
          </button>
        </div>
      </div>
    </article>
  );
}
