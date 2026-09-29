"use client";

import {
  Bookmark,
  Check,
  Clock3,
  MessageCircle,
  Plus,
  Utensils,
} from "lucide-react";
import { useHousehold } from "@/components/household-provider";
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
  } = useHousehold();
  const saved = state.workspace.recipeBox.some(
    (entry) => entry.recipe.id === recipe.id,
  );
  const planned = state.meals.filter(
    (meal) => meal.recipe.id === recipe.id,
  ).length;
  const inStock = recipe.ingredients.filter(
    (ingredient) =>
      state.pantry
        .filter(
          (item) =>
            item.id === ingredient.ingredientId &&
            item.unit === ingredient.unit,
        )
        .reduce((total, item) => total + item.quantity, 0) >=
      (ingredient.quantity * servings) / recipe.servings,
  ).length;
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
          {source === "demo" ? "Sample recipe" : "AI recipe"}
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
          {inStock} of {recipe.ingredients.length} ingredients on hand
        </div>
        <RecipeDetails recipe={recipe} servings={servings} />
        <button
          className="button"
          disabled={state.meals.length >= 50}
          onClick={() => {
            addMeal(recipe, servings);
            onNotice(`${recipe.name} added to your plan for ${servings}.`);
          }}
        >
          <Plus size={16} aria-hidden="true" />
          {planned ? "Add another meal" : "Add to plan"}
        </button>
        {planned > 0 ? (
          <p className="recipe-planned">
            <Check size={12} aria-hidden="true" />
            In your plan {planned > 1 ? `× ${planned}` : ""}
          </p>
        ) : null}
        <div className="recipe-secondary-actions">
          <button
            className="text-button"
            aria-pressed={saved}
            disabled={!saved && state.workspace.recipeBox.length >= 100}
            onClick={() => {
              if (saved) removeSavedRecipe(recipe.id);
              else saveRecipe(recipe, source);
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
              discussRecipe(recipe, servings);
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
