"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bookmark,
  LayoutGrid,
  CalendarDays,
  LoaderCircle,
  MessageCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import { MealChatPanel } from "@/components/meal-chat-panel";
import { MealPlanPanel } from "@/components/meal-plan-panel";
import { RecipeCard } from "@/components/recipe-card";
import { selectedPreferenceLabels } from "@/features/meals/recommendation-options";
import { RecipeImportPanel } from "@/components/recipe-import-panel";
import { knownIngredientsFromHousehold } from "@/features/pantry/ingredients";
import { useMealSuggestions } from "@/features/meals/use-meal-suggestions";
import { RecipeFeed } from "@/components/recipe-feed";
import { buildShoppingList } from "@/features/planning/shopping";
import { preferencesSchema, type Preferences } from "@/lib/contracts";

const modes = [
  { id: "suggestions", label: "Suggestions", icon: LayoutGrid },
  { id: "chat", label: "Chat", icon: MessageCircle },
  { id: "plan", label: "Calendar", icon: CalendarDays },
] as const;

export function MealsPanel({ aiMode }: { aiMode: "demo" | "ai" }) {
  const { state, setPreferences, setWorkspaceMode, householdResetVersion, appendSuggestionBlock, setSuggestionDirection, setSuggestionStreamEnabled, deferAiRequests } = useHousehold();
  const [collection, setCollection] = useState<"suggested" | "saved">(
    "suggested",
  );
  const [message, setMessage] = useState("");
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSeed, setImportSeed] = useState({ url: "", resetVersion: householdResetVersion, request: 0 });
  const importUrl = importSeed.resetVersion === householdResetVersion ? importSeed.url : "";
  const kitchen = { pantry: state.pantry, preferences: state.preferences, direction: state.workspace.suggestions.direction };
  const contextKey = JSON.stringify(kitchen);
  const { blocks, direction, streamEnabled } = state.workspace.suggestions;
  const { loading, error, explanation, waiting, cooldownActive, generateNext, pause, resume } = useMealSuggestions(
    JSON.stringify({
      ...kitchen,
      knownIngredients: knownIngredientsFromHousehold(state),
      preferredIngredients: state.workspace.suggestions.pendingIngredients,
    }),
    contextKey,
    {
      enabled: state.workspace.mode === "suggestions" && collection === "suggested" && !importOpen,
      aiMode,
      blocks,
      streamEnabled,
      appendSuggestionBlock,
      setSuggestionStreamEnabled,
      resetVersion: householdResetVersion,
      aiCooldownUntil: state.workspace.aiCooldownUntil,
      deferAiRequests,
      recentRecipeNames: state.workspace.suggestions.recentRecipeNames,
    },
  );
  const shopping = buildShoppingList(state.pantry, state.meals);
  const mode = state.workspace.mode;
  const draftMeals = state.workspace.calendar.draft ?? state.meals;
  const profileLabels = selectedPreferenceLabels([
    ...(state.preferences.goals ?? []),
    ...(state.preferences.dietaryNeeds ?? []),
    ...(state.preferences.nutritionFocus ?? []),
    ...(state.preferences.flavorPreferences ?? []),
    ...(state.preferences.cuisinePreferences ?? []),
    ...(state.preferences.cookingStyles ?? []),
  ]);

  function updatePreferences(patch: Partial<Preferences>) {
    const parsed = preferencesSchema.safeParse({
      ...state.preferences,
      ...patch,
    });
    if (!parsed.success) {
      setPreferenceError(
        "Choose 1–12 servings and between 10 and 120 minutes.",
      );
      return;
    }
    setPreferenceError(null);
    setCollection("suggested");
    setPreferences(parsed.data);
  }

  function generateMore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCollection("suggested");
    generateNext();
  }

  return (
    <>
      <header
        className={
          mode === "plan"
            ? "page-heading calendar-page-heading"
            : "page-heading"
        }
      >
        <div>
          <p className="eyebrow">ONE KITCHEN. MANY POSSIBILITIES.</p>
          <h1>
            {mode === "plan"
              ? "A good week starts here."
              : "Find your next good meal."}
          </h1>
          <p>Browse an idea, talk it through, make it a plan.</p>
        </div>
        <span className="pill demo-pill">{aiMode === "ai" ? "AI kitchen assistant" : "Demo recipe workspace"}</span>
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
          {state.preferences.onboardingComplete
            ? "Edit preferences"
            : "Personalize meals"}
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
              <span className="workspace-count">{draftMeals.length}</span>
            ) : null}
          </button>
        ))}
        <span className="workspace-hint">Follow your appetite.</span>
      </div>
      <p className="status-message" role="status">
        {message}
      </p>
      {draftMeals.length >= 50 ? (
        <p className="error-message" role="status">
          Your plan holds up to 50 meals. Remove one to add another.
        </p>
      ) : null}
      {state.workspace.recipeBox.length >= 100 ? (
        <p className="error-message" role="status">
          Your recipe box holds up to 100 recipes. Unsave one to make room.
        </p>
      ) : null}
      <div hidden={!importOpen}>
        <RecipeImportPanel
          key={`${householdResetVersion}:${importSeed.request}`}
          initialUrl={importUrl}
          aiMode={aiMode}
          onClose={() => setImportOpen(false)}
          onNotice={setMessage}
          onSaved={() => { setCollection("saved"); setWorkspaceMode("suggestions"); setImportOpen(false); }}
        />
      </div>
      <div hidden={mode !== "suggestions"}>
        <section
          className="preferences-card"
          aria-labelledby="preferences-heading"
        >
          <div className="preferences-intro">
            <h2 id="preferences-heading">Make it fit your day.</h2>
            <p>
              {aiMode === "ai"
                ? "Your pantry and preferences guide each new block. Earlier recipes stay here as you explore."
                : "Choose what works for you. Demo ideas come from the same sample recipes."}
            </p>
          </div>
          <form
            className="preferences-form"
            onSubmit={generateMore}
          >
            <label className="field">
              Servings
              <select
                name="servings"
                value={state.preferences.servings}
                onChange={(event) => updatePreferences({ servings: Number(event.target.value) })}
              >
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
                value={state.preferences.maxMinutes}
                onChange={(event) => updatePreferences({ maxMinutes: Number(event.target.value) })}
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
                checked={state.preferences.prioritizeUseSoon}
                onChange={(event) => updatePreferences({ prioritizeUseSoon: event.target.checked })}
              />{" "}
              Prioritize use-soon ingredients
            </label>
            <button className="button" type="submit" disabled={loading || cooldownActive}>
              {loading ? (
                <LoaderCircle
                  size={16}
                  className="spinning"
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw size={16} aria-hidden="true" />
              )}
              {waiting ? "Waiting for AI…" : loading
                ? aiMode === "ai" ? "Building a block…" : "Finding ideas…"
                : aiMode === "ai" ? "Generate next block" : "Refresh sample ideas"}
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
                : "Your recipe stream"}
            </h2>
            <p className="muted">
              {collection === "saved"
                ? "Keep the good ideas close. Plan them whenever you like."
                : aiMode === "ai"
                  ? "Fresh ideas in blocks of six. Save the ones you love."
                  : "Sample recipes, matched to your pantry and time."}
            </p>
          </div>
          <div className="collection-actions">
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
          <button className="button secondary" onClick={() => {
            setImportOpen(true);
            requestAnimationFrame(() => document.getElementById("import-heading")?.focus());
          }}>
            <Plus size={16} aria-hidden="true" /> Add recipe
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
          ) : (
            <RecipeFeed
              key={householdResetVersion}
              aiMode={aiMode}
              blocks={blocks}
              contextKey={contextKey}
              direction={direction}
              streamEnabled={streamEnabled}
              loading={loading}
              error={error}
              explanation={explanation}
              waiting={waiting}
              cooldownActive={cooldownActive}
              cooldownUntil={state.workspace.aiCooldownUntil}
              onDirection={(value) => {
                setSuggestionDirection(value);
                setCollection("suggested");
                if (value === direction) generateNext();
                else setSuggestionStreamEnabled(true);
              }}
              onNext={generateNext}
              onPause={pause}
              onResume={resume}
              onNotice={setMessage}
            />
          )}
        </section>
      </div>
      <div hidden={mode !== "chat"}>
        <MealChatPanel active={mode === "chat" && !importOpen} aiMode={aiMode} onNotice={setMessage} onImportUrl={(url) => {
          setImportSeed((previous) => ({ url, resetVersion: householdResetVersion, request: previous.request + 1 }));
          setImportOpen(true);
          requestAnimationFrame(() => document.getElementById("import-heading")?.focus());
        }} />
      </div>
      <div hidden={mode !== "plan"}>
        <MealPlanPanel
          onNotice={setMessage}
          suggestions={blocks.flatMap((block) => block.recipes.map((recipe) => ({ recipe, source: block.source, servings: block.servings })))}
          suggestionSource={aiMode}
          loading={false}
          onRefresh={() => { setCollection("suggested"); setWorkspaceMode("suggestions"); generateNext(); }}
        />
      </div>
      {mode !== "plan" ? (
        <aside className="workspace-plan-strip" aria-label="Plan overview">
          <div>
            <span className="eyebrow">IT ALL COMES TOGETHER</span>
            <h2>
              {draftMeals.length
                ? `${draftMeals.length} ${draftMeals.length === 1 ? "meal" : "meals"} in your calendar`
                : "A little inspiration. A plan that fits."}
            </h2>
            <p>
              {state.meals.length
                ? `${shopping.length} ${shopping.length === 1 ? "ingredient" : "ingredients"} for committed meals · arrange drafts in your calendar`
                : "Arrange recipes from every view, then commit your calendar to update groceries."}
            </p>
          </div>
          <div className="actions">
            <button
              className="button secondary"
              onClick={() => setWorkspaceMode("plan")}
            >
              Open calendar <ArrowRight size={15} aria-hidden="true" />
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
