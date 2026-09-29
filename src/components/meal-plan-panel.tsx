"use client";

import Link from "next/link";
import { ArrowRight, MessageCircle, Plus, X } from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import { RecipeDetails } from "@/components/recipe-card";

export function MealPlanPanel({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const {
    state,
    setWorkspaceMode,
    setChatDraft,
    clearRecipeFocus,
    removeMeal,
    setMealServings,
    discussRecipe,
  } = useHousehold();
  return (
    <section className="card workspace-plan" aria-labelledby="plan-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR NEXT GOOD MEALS</p>
          <h2 id="plan-heading">
            The plan <span className="count-badge">{state.meals.length}</span>
          </h2>
        </div>
        <button
          className="button secondary"
          onClick={() => setWorkspaceMode("suggestions")}
        >
          <Plus size={16} aria-hidden="true" />
          Find a meal
        </button>
      </div>
      {state.meals.length ? (
        <>
          <div className="planned-meals">
            {state.meals.map((meal, index) => (
              <article className="planned-entry" key={meal.id}>
                <div className="planned-meal">
                  <span className="plan-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="planned-meal-title">
                    <h3>{meal.recipe.name}</h3>
                    <p>
                      {meal.recipe.minutes} minutes ·{" "}
                      {meal.recipe.ingredients.length} ingredients
                    </p>
                  </div>
                  <label className="servings-field">
                    <span>Servings</span>
                    <select
                      aria-label={`Servings for ${meal.recipe.name}, meal ${index + 1}`}
                      value={meal.servings}
                      onChange={(event) =>
                        setMealServings(meal.id, Number(event.target.value))
                      }
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${meal.recipe.name}, meal ${index + 1}`}
                    onClick={() => {
                      removeMeal(meal.id);
                      onNotice(`${meal.recipe.name} removed from your plan.`);
                    }}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                <div className="planned-entry-details">
                  <RecipeDetails
                    recipe={meal.recipe}
                    servings={meal.servings}
                  />
                  <button
                    className="text-button"
                    onClick={() => {
                      discussRecipe(meal.recipe, meal.servings);
                      if (!state.workspace.chatDraft)
                        setChatDraft("What do I need for this recipe?");
                      requestAnimationFrame(() =>
                        document.getElementById("meal-message")?.focus(),
                      );
                    }}
                  >
                    <MessageCircle size={14} aria-hidden="true" />
                    Discuss this recipe
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="plan-footer">
            <button
              className="text-button"
              onClick={() => {
                clearRecipeFocus();
                setChatDraft("Review my plan");
                setWorkspaceMode("chat");
                requestAnimationFrame(() =>
                  document.getElementById("meal-message")?.focus(),
                );
              }}
            >
              <MessageCircle size={15} aria-hidden="true" />
              Talk through my plan
            </button>
            <Link className="button" href="/shopping">
              See shopping list <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <Plus size={28} aria-hidden="true" />
          <h3>Start with something that sounds good.</h3>
          <p>
            Add a recipe from suggestions, your recipe box, or a chat. It all
            comes together here.
          </p>
          <button
            className="button"
            onClick={() => setWorkspaceMode("suggestions")}
          >
            Explore recipes <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <p className="footnote">
        Servings update your shopping quantities. Planning a meal keeps your
        pantry amounts as they are.
      </p>
    </section>
  );
}
