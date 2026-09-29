"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bookmark,
  Clock3,
  LayoutGrid,
  ListChecks,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import { MealChatPanel } from "@/components/meal-chat-panel";
import { MealPlanPanel } from "@/components/meal-plan-panel";
import { RecipeCard } from "@/components/recipe-card";
import { selectedPreferenceLabels } from "@/features/meals/recommendation-options";
import { useMealSuggestions } from "@/features/meals/use-meal-suggestions";
import { buildShoppingList } from "@/features/planning/shopping";
import { preferencesSchema } from "@/lib/contracts";

const modes = [
  { id: "suggestions", label: "Suggestions", icon: LayoutGrid },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "plan", label: "My plan", icon: ListChecks },
] as const;

export function MealsPanel() {
  const { state, setPreferences, setWorkspaceMode } = useHousehold();
  const [collection, setCollection] = useState<"suggested" | "saved">(
    "suggested",
  );
  const [message, setMessage] = useState("");
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const { loading, current, refresh } = useMealSuggestions(
    JSON.stringify({ pantry: state.pantry, preferences: state.preferences }),
  );
  const shopping = buildShoppingList(state.pantry, state.meals);
  const mode = state.workspace.mode;
  const profileLabels = selectedPreferenceLabels([
    ...(state.preferences.goals ?? []),
    ...(state.preferences.dietaryNeeds ?? []),
    ...(state.preferences.nutritionFocus ?? []),
    ...(state.preferences.flavorPreferences ?? []),
    ...(state.preferences.cuisinePreferences ?? []),
    ...(state.preferences.cookingStyles ?? []),
  ]);

  function updatePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = preferencesSchema.safeParse({
      ...state.preferences,
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
    refresh();
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">ONE KITCHEN. MANY POSSIBILITIES.</p>
          <h1>Find your next good meal.</h1>
          <p>Browse an idea, talk it through, make it a plan.</p>
        </div>
        <span className="pill demo-pill">Your recipe workspace</span>
      </header>
      <section
        className={`personalization-banner${state.preferences.onboardingComplete ? " complete" : ""}`}
        aria-label="Recommendation preferences"
      >
        <div>
          <p className="eyebrow">
            {state.preferences.onboardingComplete
              ? "PERSONALIZED FOR YOU"
              : "MAKE THESE IDEAS YOURS"}
          </p>
          <h2>
            {state.preferences.onboardingComplete
              ? "Your priorities are shaping these meals."
              : "Tell us what good food looks like for you."}
          </h2>
          <p>
            {state.preferences.onboardingComplete
              ? profileLabels.length
                ? profileLabels.slice(0, 5).join(" · ")
                : "Your saved preferences are active."
              : "Set goals, dietary needs, allergies, and the cooking styles you enjoy."}
          </p>
        </div>
        <Link className="button secondary" href="/onboarding">
          {state.preferences.onboardingComplete ? "Edit preferences" : "Personalize meals"}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <div
        className="workspace-navigation"
        role="group"
        aria-label="Recipe workspace views"
      >
        {modes.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={mode === id}
            className={mode === id ? "workspace-view active" : "workspace-view"}
            onClick={() => setWorkspaceMode(id)}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
            {id === "plan" ? (
              <span className="workspace-count">{state.meals.length}</span>
            ) : null}
          </button>
        ))}
        <span className="workspace-hint">Follow your appetite.</span>
      </div>
      <p className="status-message" role="status">
        {message}
      </p>
      {state.meals.length >= 50 ? (
        <p className="error-message" role="status">
          Your plan holds up to 50 meals. Remove one to add another.
        </p>
      ) : null}
      {state.workspace.recipeBox.length >= 100 ? (
        <p className="error-message" role="status">
          Your recipe box holds up to 100 recipes. Unsave one to make room.
        </p>
      ) : null}
      <div hidden={mode !== "suggestions"}>
        <section
          className="preferences-card"
          aria-labelledby="preferences-heading"
        >
          <div className="preferences-intro">
            <h2 id="preferences-heading">Make it fit your day.</h2>
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
                <LoaderCircle
                  size={16}
                  className="spinning"
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw size={16} aria-hidden="true" />
              )}
              {loading ? "Finding ideas…" : "Update ideas"}
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
            <h2>
              {collection === "saved"
                ? "Your recipe box"
                : "A few things you could make"}
            </h2>
            <p className="muted">
              {collection === "saved"
                ? "Keep the good ideas close. Plan them whenever you like."
                : current?.response?.source === "ai"
                  ? "Ideas based on your kitchen and preferences."
                  : "Sample recipes, matched to your pantry and time."}
            </p>
          </div>
          <div
            className="collection-switch"
            role="group"
            aria-label="Recipe collection"
          >
            <button
              aria-pressed={collection === "suggested"}
              onClick={() => setCollection("suggested")}
            >
              For you
            </button>
            <button
              aria-pressed={collection === "saved"}
              onClick={() => setCollection("saved")}
            >
              <Bookmark size={13} aria-hidden="true" />
              Recipe box {state.workspace.recipeBox.length}
            </button>
          </div>
        </div>
        <section
          aria-label={
            collection === "saved" ? "Saved recipes" : "Meal suggestions"
          }
          aria-busy={collection === "suggested" && loading}
        >
          {collection === "saved" ? (
            state.workspace.recipeBox.length ? (
              <div className="recipe-grid">
                {state.workspace.recipeBox.map(({ recipe, source }, index) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    source={source}
                    servings={state.preferences.servings}
                    index={index}
                    onNotice={setMessage}
                  />
                ))}
              </div>
            ) : (
              <div className="card empty-state">
                <Bookmark size={28} aria-hidden="true" />
                <h3>A home for the keepers.</h3>
                <p>
                  Save a recipe from suggestions or chat. It will be waiting
                  here next time.
                </p>
                <button
                  className="button"
                  onClick={() => setCollection("suggested")}
                >
                  Browse suggestions
                </button>
              </div>
            )
          ) : loading ? (
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
              <button className="button" onClick={refresh}>
                Try again
              </button>
            </div>
          ) : current?.response?.recipes.length ? (
            <div className="recipe-grid">
              {current.response.recipes.map((recipe, index) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  source={current.response!.source}
                  servings={state.preferences.servings}
                  index={index}
                  onNotice={setMessage}
                />
              ))}
            </div>
          ) : (
            <div className="card empty-state">
              <Clock3 size={28} aria-hidden="true" />
              <h3>A little more time opens things up.</h3>
              <p>
                No recipes fit this time limit. Try 25 minutes or more for the
                sample recipes.
              </p>
            </div>
          )}
        </section>
      </div>
      <div hidden={mode !== "chat"}>
        <MealChatPanel onNotice={setMessage} />
      </div>
      <div hidden={mode !== "plan"}>
        <MealPlanPanel onNotice={setMessage} />
      </div>
      {mode !== "plan" ? (
        <aside className="workspace-plan-strip" aria-label="Plan overview">
          <div>
            <span className="eyebrow">IT ALL COMES TOGETHER</span>
            <h2>
              {state.meals.length
                ? `${state.meals.length} ${state.meals.length === 1 ? "meal" : "meals"} in your plan`
                : "A little inspiration. A plan that fits."}
            </h2>
            <p>
              {state.meals.length
                ? `${shopping.length} ${shopping.length === 1 ? "ingredient" : "ingredients"} to pick up · pantry amounts stay unchanged`
                : "Recipes from every view meet in the same plan and shopping list."}
            </p>
          </div>
          <div className="actions">
            <button
              className="button secondary"
              onClick={() => setWorkspaceMode("plan")}
            >
              Open my plan <ArrowRight size={15} aria-hidden="true" />
            </button>
            {state.meals.length > 0 ? (
              <Link href="/shopping" className="text-link">
                Shopping list <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}
