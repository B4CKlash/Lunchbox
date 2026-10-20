"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { CalendarDays, ShoppingBasket, X } from "lucide-react";
import { packageStockLabel } from "@/features/pantry/natural-stock-entry";
import { previewUnscheduledShopping } from "@/features/planning/candidate-shopping";
import { createSettingsDraft, resolveSettingsDraft } from "@/features/planning/settings-draft";
import type { HouseholdState, PilotOperation, Recipe, Unit } from "@/lib/contracts";
import styles from "./planning-workspace.module.css";
import selectedStyles from "./selected-meal-groceries.module.css";

type SelectedMealGroceriesProps = {
  state: HouseholdState;
  recipes: Recipe[];
  portionDrafts: Record<string, string>;
  onPortionsChange: (recipeId: string, value: string) => void;
  onRemove: (recipe: Recipe) => void;
  onInspect: (recipe: Recipe) => void;
  onSchedule: (recipe: Recipe, portions: number) => void;
  onBack: () => void;
  run: (operation: PilotOperation) => Promise<boolean>;
  warnings?: Record<string, string>;
  updatedRecipes?: Record<string, Recipe>;
  onUseUpdated?: (recipe: Recipe) => void;
};

const amount = (quantity: number, unit: Unit) => `${quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${unit}`;
const ingredientKey = (ingredient: { ingredientId: string; unit: Unit }) => JSON.stringify([ingredient.ingredientId, ingredient.unit]);
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function SelectedMealGroceries({ state, recipes, portionDrafts, onPortionsChange, onRemove, onInspect, onSchedule, onBack, run, warnings = {}, updatedRecipes = {}, onUseUpdated }: SelectedMealGroceriesProps) {
  const inputPrefix = useId();
  const selected = recipes.map((recipe) => {
    const draft = portionDrafts[recipe.id] ?? String(recipe.servings);
    const portions = Number(draft);
    return { recipe, draft, portions, valid: draft.trim() !== "" && Number.isFinite(portions) && portions >= 0.001 && portions <= 1000 };
  });
  const valid = selected.every((entry) => entry.valid);
  const preview = recipes.length && valid ? previewUnscheduledShopping(state, selected) : null;
  const needsAttention = new Set(preview ? [...preview.shortages, ...preview.checks].map(ingredientKey) : []);
  const covered = preview?.requirements.filter((item) => !needsAttention.has(ingredientKey(item))) ?? [];

  return <section className={styles.panel} aria-label="Combined groceries for selected meals">
    <div className={styles.panelHeader}>
      <div><h2><ShoppingBasket size={18} aria-hidden="true" />Groceries for your choices</h2><p>Choose total portions. You can work out dates later.</p></div>
    </div>
    <div className={styles.panelBody}>
      {!selected.length ? <div className={styles.empty}><h3>Keep a recipe to start your grocery preview.</h3><p>Choose meals you like, then combine their ingredients here.</p><button type="button" className={styles.quietButton} onClick={onBack}>Find meals</button></div> : <>
        <div className={selectedStyles.recipes} aria-label="Selected recipes and total portions">
          {selected.map(({ recipe, draft, portions, valid: recipeValid }, index) => <div className={selectedStyles.recipe} key={recipe.id}>
            <button type="button" className={`${styles.textButton} ${selectedStyles.recipeName}`} onClick={() => onInspect(recipe)}>{recipe.name}</button>
            <label className={`${styles.field} ${selectedStyles.portions}`} htmlFor={`${inputPrefix}-${index}`}>Total portions
              <input id={`${inputPrefix}-${index}`} className={styles.input} type="number" min={0.001} max={1000} step="any" value={draft} aria-label={`Total portions for ${recipe.name}`} aria-invalid={!recipeValid} aria-describedby={!recipeValid ? `${inputPrefix}-${index}-error` : undefined} onChange={(event) => onPortionsChange(recipe.id, event.target.value)} />
            </label>
            <div className={selectedStyles.recipeActions}>
              <button type="button" className={styles.smallButton} disabled={!valid} onClick={() => { if (valid) onSchedule(recipe, portions); }}><CalendarDays size={13} aria-hidden="true" />Plan this recipe</button>
              <button type="button" className={styles.smallButton} aria-label={`Remove ${recipe.name} from grocery preview`} onClick={() => onRemove(recipe)}><X size={13} aria-hidden="true" /><span className={selectedStyles.removeLabel}>Remove</span></button>
            </div>
            {!recipeValid ? <p id={`${inputPrefix}-${index}-error`} className={selectedStyles.validation}>Enter total portions from 0.001 to 1,000.</p> : null}
            {warnings[recipe.id] || (updatedRecipes[recipe.id] && onUseUpdated) ? <div className={`${styles.notice} ${selectedStyles.recipeNotice}`}>
              <p>{warnings[recipe.id] || "An updated recipe is available. Your kept version stays here until you choose to replace it."}</p>
              {updatedRecipes[recipe.id] && onUseUpdated ? <button type="button" className={styles.smallButton} onClick={() => onUseUpdated(updatedRecipes[recipe.id])}>Use updated recipe</button> : null}
            </div> : null}
          </div>)}
        </div>
        {!valid ? <p className={styles.notice} role="status">Choose a valid total for every recipe to calculate combined groceries or plan a recipe. Your entries are kept as typed.</p> : null}
        {preview ? <>
          <p className={`${styles.subtle} ${selectedStyles.scope}`}>Additional needs after existing cooking plans through {dateLabel(preview.shopThrough)}. Shared ingredients use your pantry stock once.</p>
          <div className={selectedStyles.columns}>
            <section aria-label="Additional ingredients to buy">
              <h3 className={selectedStyles.sectionTitle}>Additional to buy · {preview.shortages.length}</h3>
              {preview.shortages.length ? <ul className={selectedStyles.list}>{preview.shortages.map((item) => {
                const requirement = preview.requirements.find((entry) => ingredientKey(entry) === ingredientKey(item))!;
                return <li className={selectedStyles.need} key={ingredientKey(item)}>
                  <div className={selectedStyles.needHeading}><strong>{item.name}</strong><strong>{amount(item.quantity, item.unit)}</strong></div>
                  <p className={styles.subtle}>Selected recipes: {amount(requirement.candidateRequired, item.unit)} · existing plans: {amount(requirement.existingRequired, item.unit)} · known stock: {amount(requirement.knownAvailable, item.unit)}.</p>
                  {item.totalQuantity !== item.quantity ? <p className={styles.formNotice}>Including existing plans, {amount(item.totalQuantity, item.unit)} to buy in total.</p> : null}
                </li>;
              })}</ul> : <p className={styles.subtle}>No additional calculated shortages{preview.checks.length ? "; check the uncertain stock below." : "."}</p>}
            </section>
            <section aria-label="Ingredients with uncertain stock">
              <h3 className={selectedStyles.sectionTitle}>Check at home · {preview.checks.length}</h3>
              {preview.checks.length ? <ul className={selectedStyles.list}>{preview.checks.map((item) => <li className={selectedStyles.check} key={ingredientKey(item)}>
                <strong>{item.name}</strong>
                <p className={styles.subtle}>Need {amount(item.required, item.unit)} in total: {amount(item.candidateRequired, item.unit)} for these choices and {amount(item.existingRequired, item.unit)} for existing plans.</p>
                <p className={styles.formNotice}>{amount(item.knownAvailable, item.unit)} known stock · {amount(item.knownRemainder, item.unit)} still to verify. This is not a definite amount to buy.</p>
                {item.packageStock.length ? <p className={styles.formNotice}>{item.packageStock.map(packageStockLabel).join(", ")} · contents unresolved. Container counts are not converted to {item.unit}.</p> : null}
                <MeasuredStockTotal state={state} ingredient={item} run={run} />
              </li>)}</ul> : <p className={styles.subtle}>No uncertain quantities for this selection.</p>}
            </section>
          </div>
          {covered.length ? <details className={styles.details}><summary>Already covered by known stock · {covered.length} ingredients</summary><ul className={selectedStyles.list}>{covered.map((item) => <li className={selectedStyles.need} key={ingredientKey(item)}><strong>{item.name}</strong><p className={styles.subtle}>Selected recipes: {amount(item.candidateRequired, item.unit)} · existing plans: {amount(item.existingRequired, item.unit)} · known stock: {amount(item.knownAvailable, item.unit)}.</p></li>)}</ul></details> : null}
          <p className={`${styles.formNotice} ${selectedStyles.previewNote}`}>Preview only. Previewing does not assign dates or change your plan, shopping window or stock. A measured stock update is saved only when you confirm it.</p>
        </> : null}
      </>}
    </div>
  </section>;
}

function MeasuredStockTotal({ state, ingredient, run }: { state: HouseholdState; ingredient: { ingredientId: string; name: string; unit: Unit }; run: SelectedMealGroceriesProps["run"] }) {
  const inputId = useId();
  const stock = state.pilot?.stock.find((entry) => ingredientKey(entry) === ingredientKey(ingredient));
  const incoming = { quantity: "", stockKey: JSON.stringify([
    stock,
    state.pantry.filter((entry) => entry.id === ingredient.ingredientId && entry.unit === ingredient.unit),
    state.pilot?.packageStock.filter((entry) => entry.ingredientId === ingredient.ingredientId),
  ]) };
  const [form, setForm] = useState(() => createSettingsDraft(incoming));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const resolved = resolveSettingsDraft(form, incoming);
  if (resolved.draft !== form) setForm(resolved.draft);
  const raw = resolved.draft.values.quantity;
  const quantity = Number(raw);
  const valid = raw.trim() !== "" && Number.isFinite(quantity) && quantity >= 0 && quantity <= 100000;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current || !valid || resolved.conflict) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await run({ type: "set_stock", stock: { ...stock, ingredientId: ingredient.ingredientId, name: ingredient.name, unit: ingredient.unit, status: "exact", quantity } });
      if (saved) setForm(createSettingsDraft(incoming));
      else setError("This stock total was not saved. Your measured amount is kept; retry when ready.");
    } catch {
      setError("This stock total was not saved. Your measured amount is kept; check your connection and retry.");
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <details className={styles.details}>
    <summary>Confirm a measured amount</summary>
    <p className={styles.formNotice}>Enter the current total you measured in {ingredient.unit}, including any contents you counted. This replaces the recorded total; it does not add a purchase.</p>
    {resolved.conflict ? <div className={styles.notice} role="alert"><p>This ingredient’s stock changed while you were entering an amount. Your draft is kept. Review current stock before saving a new total.</p><button type="button" className={styles.smallButton} onClick={() => { setForm(createSettingsDraft(incoming)); setError(""); }}>Load current stock</button></div> : null}
    <form className={selectedStyles.stockForm} onSubmit={(event) => void save(event)}>
      <label className={styles.field} htmlFor={inputId}>Measured total of {ingredient.name} ({ingredient.unit})
        <input id={inputId} className={styles.input} type="number" min={0} max={100000} step="any" required disabled={saving} value={raw} aria-invalid={raw !== "" && !valid} onChange={(event) => { setForm((current) => ({ ...current, values: { ...current.values, quantity: event.target.value } })); setError(""); }} />
      </label>
      <button className={styles.smallButton} type="submit" disabled={saving || !valid || resolved.conflict}>{saving ? "Saving…" : "Confirm stock total"}</button>
    </form>
    {raw !== "" && !valid ? <p className={selectedStyles.validation}>Enter a measured amount from 0 to 100,000 {ingredient.unit}.</p> : null}
    {error ? <p className={styles.notice} role="alert">{error}</p> : null}
    <p className={styles.formNotice}>Container observations stay separate. <Link href="/pantry">Review your pantry</Link> to correct them or other stock details.</p>
  </details>;
}
