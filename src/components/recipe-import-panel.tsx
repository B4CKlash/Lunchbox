"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FileText, Link2, LoaderCircle, Plus, X } from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import { mealFailureMessage, mealRequestError } from "@/features/meals/client-request";
import { finalizeImportDraft } from "@/features/meals/import-draft";
import { knownIngredientsFromHousehold, resolveIngredient } from "@/features/pantry/ingredients";
import { importRecipeResponseSchema, type ImportRecipeResponse, type KnownIngredient, type RecipeDraftIngredient, type Unit } from "@/lib/contracts";

const numberOrNull = (value: string) => value === "" ? null : Number(value);

export function RecipeImportPanel({ initialUrl, aiMode, onClose, onNotice, onSaved }: {
  initialUrl: string;
  aiMode: "ai" | "demo";
  onClose: () => void;
  onNotice: (message: string) => void;
  onSaved: () => void;
}) {
  const { state, saveRecipe, addMeal } = useHousehold();
  const [kind, setKind] = useState<"url" | "text">(initialUrl ? "url" : "text");
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportRecipeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const known = knownIngredientsFromHousehold(state);
  const draft = result?.draft;
  const calendarMeals = state.workspace.calendar.draft ?? state.meals;

  useEffect(() => () => activeRequest.current?.abort(), []);

  function stop() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoading(false);
    setError("Import stopped. Your recipe is still here.");
  }

  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/meals/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "url"
          ? { kind, url: url.trim(), knownIngredients: known }
          : { kind, text, sourceUrl: /^https:\/\//i.test(url.trim()) ? url.trim() : undefined, knownIngredients: known }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(50000)]),
      });
      if (!response.ok) throw new Error(await mealRequestError(response));
      const parsed = importRecipeResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("This recipe couldn’t be read. Your original input is still here; try pasting the recipe text.");
      if (controller.signal.aborted) return;
      setResult(parsed.data);
    } catch (reason) {
      if (!controller.signal.aborted) setError(mealFailureMessage(reason));
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }

  function updateIngredient(index: number, changes: Partial<RecipeDraftIngredient>, match = false) {
    setResult((current) => {
      if (!current) return current;
      const ingredients = [...current.draft.ingredients];
      const ingredient = { ...ingredients[index], ...changes };
      if (match && ingredient.name.trim() && ingredient.unit) {
        const resolution = resolveIngredient({ name: ingredient.name, unit: ingredient.unit, ingredientId: ingredient.ingredientId }, known);
        if (resolution.status === "resolved") {
          ingredient.ingredientId = resolution.ingredient.ingredientId;
          ingredient.candidates = undefined;
        } else {
          ingredient.ingredientId = null;
          ingredient.candidates = resolution.candidates;
        }
      }
      ingredients[index] = ingredient;
      return { ...current, draft: { ...current.draft, ingredients } };
    });
  }

  function save(plan: boolean) {
    if (!result) return;
    setError(null);
    try {
      const recipe = finalizeImportDraft(result.draft, result.provenance, known);
      saveRecipe(recipe, "import");
      if (plan) addMeal(recipe, recipe.servings);
      onNotice(plan
        ? `${recipe.name} saved to your recipe box and added to your calendar draft. Choose a day, then commit the calendar to update shopping.`
        : `${recipe.name} saved to your recipe box.`);
      setResult(null);
      setText("");
      setUrl("");
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Review every ingredient and complete the missing recipe details before saving.");
    }
  }

  function matchLabel(candidate: KnownIngredient) {
    const stock = state.pantry.find((item) => item.id === candidate.ingredientId && item.unit === candidate.unit);
    if (stock) return `${candidate.name} · pantry: ${stock.quantity} ${stock.unit}`;
    const saved = state.workspace.recipeBox.find((entry) => entry.recipe.ingredients.some((item) => item.ingredientId === candidate.ingredientId));
    return `${candidate.name} (${candidate.unit})${saved ? ` · ${saved.recipe.name}` : ""}`;
  }

  return (
    <section className="card recipe-import" aria-labelledby="import-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BRING YOUR FAVORITES ALONG</p>
          <h2 id="import-heading" tabIndex={-1}>{draft ? "Make it your recipe." : "Add a recipe."}</h2>
          <p className="muted">{draft ? "Check the original recipe, fill in missing details, then save it." : "Start with a public recipe link or paste the recipe text."}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close recipe import" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </div>

      {!draft ? (
        <form onSubmit={extract} aria-busy={loading}>
          <div className="collection-switch import-methods" role="group" aria-label="Recipe import method">
            <button type="button" aria-pressed={kind === "url"} disabled={loading} onClick={() => setKind("url")}><Link2 size={15} aria-hidden="true" />Recipe link</button>
            <button type="button" aria-pressed={kind === "text"} disabled={loading} onClick={() => setKind("text")}><FileText size={15} aria-hidden="true" />Paste text</button>
          </div>
          {kind === "url" ? (
            <label className="field">Public recipe link
              <input type="url" required maxLength={2048} value={url} disabled={loading} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
              <span className="footnote">If a website can’t be read, paste its recipe text instead.</span>
            </label>
          ) : (
            <>
              <label className="field">Recipe text
                <textarea required rows={8} maxLength={20000} value={text} disabled={loading} onChange={(event) => setText(event.target.value)} placeholder={"Include the title, servings, cooking time, ingredients, and steps."} />
              </label>
              {/^https:\/\//i.test(url.trim()) ? <p className="footnote">Keeping the original recipe link for attribution.</p> : null}
            </>
          )}
          {aiMode === "demo" ? <p className="footnote">Recipe imports need the AI connection. Links and pasted text will be available when AI is enabled.</p> : null}
          <p className="footnote">You’ll review amounts before saving. Cups, cans, and “to taste” need your correction to grams, millilitres, or individual items.</p>
          <div className="actions">
            <button className="button" disabled={loading || !(kind === "url" ? url.trim() : text.trim())}>
              {loading ? <LoaderCircle size={16} className="spinning" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              {loading ? "Reading your recipe…" : "Read recipe"}
            </button>
            {loading ? <button type="button" className="text-button" onClick={stop}>Stop import</button> : null}
            {error && kind === "url" ? <button className="text-button" type="button" onClick={() => setKind("text")}>Paste the recipe text instead</button> : null}
          </div>
        </form>
      ) : (
        <div className="import-review">
          {result.warnings.length ? <ul className="import-warnings">{result.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
          {result.provenance.sourceUrl ? <p className="recipe-attribution"><a target="_blank" rel="noreferrer" href={result.provenance.sourceUrl}>{result.provenance.title || "Open original recipe"}</a>{result.provenance.author ? ` · ${result.provenance.author}` : ""}</p> : null}
          <div className="import-title-fields">
            <label className="field">Recipe name<input value={draft.name} maxLength={120} onChange={(event) => setResult({ ...result, draft: { ...draft, name: event.target.value } })} /></label>
            <label className="field">Base servings<input type="number" min={1} max={12} step={1} value={draft.servings ?? ""} placeholder="Required" onChange={(event) => setResult({ ...result, draft: { ...draft, servings: numberOrNull(event.target.value) } })} /></label>
            <label className="field">Total minutes<input type="number" min={1} max={240} step={1} value={draft.minutes ?? ""} placeholder="Required" onChange={(event) => setResult({ ...result, draft: { ...draft, minutes: numberOrNull(event.target.value) } })} /></label>
          </div>
          <label className="field">Description<textarea rows={2} maxLength={400} value={draft.description} onChange={(event) => setResult({ ...result, draft: { ...draft, description: event.target.value } })} /></label>
          <h3>Check every ingredient</h3>
          <p className="muted import-help">Amounts are for the recipe’s base servings. Use g, ml, or each; enter your own measurement for unsupported amounts. Choose a match when an ingredient could mean more than one thing.</p>
          <div className="import-ingredients">
            {draft.ingredients.map((ingredient, index) => (
              <fieldset className="import-ingredient" key={index}>
                <legend>Ingredient {index + 1}</legend>
                <p className="original-ingredient">Original: {ingredient.originalLine || "No original line supplied"}</p>
                <div className="import-ingredient-fields">
                  <label className="field">Name<input maxLength={80} value={ingredient.name} onChange={(event) => updateIngredient(index, { name: event.target.value, ingredientId: null, candidates: undefined })} onBlur={() => updateIngredient(index, {}, true)} /></label>
                  <label className="field">Amount<input type="number" min={0.001} max={100000} step="any" value={ingredient.quantity ?? ""} placeholder="Required" onChange={(event) => updateIngredient(index, { quantity: numberOrNull(event.target.value) })} /></label>
                  <label className="field">Unit<select value={ingredient.unit ?? ""} onChange={(event) => updateIngredient(index, { unit: event.target.value as Unit || null, ingredientId: null, candidates: undefined }, true)}><option value="">Choose unit</option><option value="g">g</option><option value="ml">ml</option><option value="each">each</option></select></label>
                </div>
                {ingredient.candidates?.length ? (
                  <label className="field ingredient-choice">Which ingredient do you mean?
                    <select value={ingredient.ingredientId ?? ""} onChange={(event) => updateIngredient(index, { ingredientId: event.target.value || null })}>
                      <option value="">Choose an ingredient</option>
                      {ingredient.candidates.map((candidate) => <option key={`${candidate.ingredientId}-${candidate.unit}`} value={candidate.ingredientId}>{matchLabel(candidate)}</option>)}
                    </select>
                  </label>
                ) : null}
                {!ingredient.quantity || !ingredient.unit ? <p className="import-needs-review">Enter a measured amount and unit before saving.</p> : null}
              </fieldset>
            ))}
          </div>
          {draft.ingredients.length < 40 ? (
            <button className="text-button" type="button" onClick={() => setResult({
              ...result,
              draft: { ...draft, ingredients: [...draft.ingredients, {
                originalLine: "Added during review",
                name: "",
                ingredientId: null,
                quantity: null,
                unit: null,
              }] },
            })}>Add an ingredient</button>
          ) : <p className="footnote">A recipe can contain up to 40 ingredients.</p>}
          <h3>Cooking steps</h3>
          <div className="import-steps">{draft.steps.map((step, index) => (
            <label key={index} className="field">Step {index + 1}<textarea rows={2} maxLength={1000} value={step} onChange={(event) => setResult({ ...result, draft: { ...draft, steps: draft.steps.map((existing, i) => i === index ? event.target.value : existing) } })} /></label>
          ))}</div>
          {draft.steps.length < 20 ? <button className="text-button" type="button" onClick={() => setResult({ ...result, draft: { ...draft, steps: [...draft.steps, ""] } })}>Add a step</button> : null}
          <div className="actions import-save-actions">
            <button className="button" disabled={state.workspace.recipeBox.length >= 100} onClick={() => save(false)}>Save recipe</button>
            <button className="button secondary" disabled={state.workspace.recipeBox.length >= 100 || calendarMeals.length >= 50} onClick={() => save(true)}>Save & add to calendar</button>
            <button className="text-button" onClick={() => { setResult(null); setError(null); }}>Back to original input</button>
          </div>
        </div>
      )}
      {error ? <p role="alert" className="error-message import-error">{error}</p> : null}
    </section>
  );
}
