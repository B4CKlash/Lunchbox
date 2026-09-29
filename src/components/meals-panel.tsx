"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Clock3,
  Leaf,
  LoaderCircle,
  Plus,
  RefreshCw,
  Utensils,
  X,
} from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import {
  preferencesSchema,
  suggestMealsResponseSchema,
  type SuggestMealsResponse,
} from "@/lib/contracts";

type SuggestionResult = {
  key: string;
  response?: SuggestMealsResponse;
  error?: string;
};
const amount = (quantity: number, unit: string) =>
  `${quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${unit}`;

export function MealsPanel() {
  const { state, setPreferences, addMeal, removeMeal, setMealServings } =
    useHousehold();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [message, setMessage] = useState("");
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const request = JSON.stringify({
    pantry: state.pantry,
    preferences: state.preferences,
  });
  const requestKey = `${retry}:${request}`;
  const loading = result?.key !== requestKey;
  const current = loading ? null : result;

  useEffect(() => {
    const controller = new AbortController();
    async function loadSuggestions() {
      try {
        const response = await fetch("/api/meals/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: request,
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            "We couldn’t load your meal ideas. Please try again.",
          );
        const parsed = suggestMealsResponseSchema.safeParse(
          await response.json(),
        );
        if (!parsed.success)
          throw new Error(
            "Those meal ideas weren’t quite right. Please try again.",
          );
        if (!controller.signal.aborted)
          setResult({ key: requestKey, response: parsed.data });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            key: requestKey,
            error:
              error instanceof Error
                ? error.message
                : "We couldn’t load your meal ideas. Please try again.",
          });
      }
    }
    void loadSuggestions();
    return () => controller.abort();
  }, [request, requestKey]);

  function updatePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = preferencesSchema.safeParse({
      servings: Number(form.get("servings")),
      maxMinutes: Number(form.get("maxMinutes")),
      prioritizeUseSoon: form.get("useSoon") === "on",
    });
    if (!parsed.success) {
      setPreferenceError(
        "Choose 1–12 servings and between 10 and 120 minutes.",
      );
      return;
    }
    setPreferenceError(null);
    setPreferences(parsed.data);
    setRetry((value) => value + 1);
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">LESS GUESSWORK. MORE GOOD FOOD.</p>
          <h1>What sounds good?</h1>
          <p>Start with your pantry. Make a plan that fits your day.</p>
        </div>
        <span className="pill demo-pill">
          <Leaf size={13} aria-hidden="true" />
          {current?.response?.source === "ai"
            ? "AI suggestions"
            : "Sample suggestions"}
        </span>
      </header>

      <section
        className="preferences-card"
        aria-labelledby="preferences-heading"
      >
        <div className="preferences-intro">
          <h2 id="preferences-heading">A little direction for dinner.</h2>
          <p>Choose what works for you.</p>
        </div>
        <form
          className="preferences-form"
          key={JSON.stringify(state.preferences)}
          onSubmit={updatePreferences}
        >
          <label className="field">
            Servings
            <select name="servings" defaultValue={state.preferences.servings}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "person" : "people"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Time available
            <select
              name="maxMinutes"
              defaultValue={state.preferences.maxMinutes}
            >
              {Array.from(
                new Set([
                  10,
                  15,
                  20,
                  25,
                  30,
                  45,
                  60,
                  90,
                  120,
                  state.preferences.maxMinutes,
                ]),
              )
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    {n} minutes
                  </option>
                ))}
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="useSoon"
              defaultChecked={state.preferences.prioritizeUseSoon}
            />{" "}
            Prioritize use-soon ingredients
          </label>
          <button className="button" type="submit" disabled={loading}>
            {loading ? (
              <LoaderCircle size={16} className="spinning" aria-hidden="true" />
            ) : (
              <RefreshCw size={16} aria-hidden="true" />
            )}
            {loading ? "Finding ideas…" : "Find meal ideas"}
          </button>
        </form>
        {preferenceError ? (
          <p className="error-message" role="alert">
            {preferenceError}
          </p>
        ) : null}
      </section>

      <div className="section-heading suggestions-heading">
        <div>
          <h2>A few things you could make</h2>
          <p className="muted">
            {current?.response?.source === "ai"
              ? "Ideas based on your kitchen and preferences."
              : "Three sample recipes, matched to your pantry and time."}
          </p>
        </div>
        <span className="eyebrow">PANTRY → PLATE</span>
      </div>
      <section aria-label="Meal suggestions" aria-busy={loading}>
        {loading ? (
          <div className="card empty-state">
            <LoaderCircle className="spinning" size={28} aria-hidden="true" />
            <h3>Looking in your kitchen…</h3>
            <p role="status">Finding meals that fit your preferences.</p>
          </div>
        ) : current?.error ? (
          <div className="card empty-state">
            <h3>Let’s give that another try.</h3>
            <p className="error-message" role="alert">
              {current.error}
            </p>
            <button
              className="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : current?.response?.recipes.length ? (
          <div className="recipe-grid">
            {current.response.recipes.map((recipe, index) => {
              const useSoon = recipe.ingredients.filter((ingredient) =>
                state.pantry.some(
                  (item) =>
                    item.id === ingredient.ingredientId &&
                    item.unit === ingredient.unit &&
                    item.quantity > 0 &&
                    item.useSoon,
                ),
              );
              const inStock = recipe.ingredients.filter(
                (ingredient) =>
                  state.pantry
                    .filter(
                      (item) =>
                        item.id === ingredient.ingredientId &&
                        item.unit === ingredient.unit,
                    )
                    .reduce((total, item) => total + item.quantity, 0) >=
                  (ingredient.quantity * state.preferences.servings) /
                    recipe.servings,
              ).length;
              return (
                <article
                  className={`recipe-card recipe-tone-${index % 3}`}
                  key={recipe.id}
                >
                  <div className="recipe-cover">
                    <span className="recipe-index" aria-hidden="true">
                      0{index + 1}
                    </span>
                    <span className="pill">
                      {useSoon.length
                        ? "Uses your use-soon ingredients"
                        : "Pantry favorite"}
                    </span>
                    <h3>{recipe.name}</h3>
                    <div className="recipe-meta">
                      <span>
                        <Clock3 size={14} aria-hidden="true" />
                        {recipe.minutes} min
                      </span>
                      <span>
                        <Utensils size={14} aria-hidden="true" />
                        {state.preferences.servings} servings
                      </span>
                    </div>
                  </div>
                  <div className="recipe-body">
                    <p>{recipe.description}</p>
                    <div className="pantry-match">
                      <span className="match-dot" />
                      {inStock} of {recipe.ingredients.length} ingredients on
                      hand
                    </div>
                    <details className="recipe-details">
                      <summary>Ingredients & steps</summary>
                      <div className="recipe-ingredients">
                        {recipe.ingredients.map(
                          (ingredient, ingredientIndex) => (
                            <div
                              key={`${ingredient.ingredientId}-${ingredientIndex}`}
                            >
                              <span>{ingredient.name}</span>
                              <span>
                                {amount(
                                  (ingredient.quantity *
                                    state.preferences.servings) /
                                    recipe.servings,
                                  ingredient.unit,
                                )}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                      <ol>
                        {recipe.steps.map((step, stepIndex) => (
                          <li key={stepIndex}>{step}</li>
                        ))}
                      </ol>
                    </details>
                    <button
                      className="button secondary"
                      disabled={state.meals.length >= 50}
                      onClick={() => {
                        addMeal(recipe, state.preferences.servings);
                        setMessage(`${recipe.name} added to your plan.`);
                      }}
                    >
                      <Plus size={16} aria-hidden="true" />
                      Add to plan
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="card empty-state">
            <Clock3 size={28} aria-hidden="true" />
            <h3>A little more time opens things up.</h3>
            <p>
              No sample recipes fit this time limit. Try 25 minutes or more.
            </p>
          </div>
        )}
      </section>
      <p className="status-message" role="status">
        {message}
      </p>
      {state.meals.length >= 50 ? (
        <p className="error-message">
          Your plan holds up to 50 meals. Remove one to add another.
        </p>
      ) : null}

      <section className="card meal-plan" aria-labelledby="plan-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR NEXT GOOD MEALS</p>
            <h2 id="plan-heading">
              The plan <span className="count-badge">{state.meals.length}</span>
            </h2>
          </div>
          {state.meals.length > 0 ? (
            <Link href="/shopping" className="button secondary">
              See shopping list <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
        {state.meals.length ? (
          <div className="planned-meals">
            {state.meals.map((meal, index) => (
              <div className="planned-meal" key={meal.id}>
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
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="icon-button"
                  aria-label={`Remove ${meal.recipe.name}, meal ${index + 1}`}
                  onClick={() => {
                    removeMeal(meal.id);
                    setMessage(`${meal.recipe.name} removed from your plan.`);
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="plan-empty">
            <span className="empty-symbol">
              <Plus size={23} aria-hidden="true" />
            </span>
            <div>
              <h3>Leave room for something good.</h3>
              <p>Add a meal above. We’ll work out what you need to pick up.</p>
            </div>
          </div>
        )}
        <p className="footnote">
          Servings update your shopping quantities. Planning a meal keeps your
          pantry amounts as they are.
        </p>
      </section>
    </>
  );
}
