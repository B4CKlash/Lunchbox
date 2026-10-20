"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, CookingPot, Plus, Trash2 } from "lucide-react";
import { addDays, localDate } from "@/features/planning/calendar";
import { buildServingPlan, type ServingAllocationDraft, type ServingPlanDraft } from "@/features/planning/serving-plan";
import type { HouseholdState, MealSlot, PilotOperation, Recipe } from "@/lib/contracts";
import styles from "./planning-workspace.module.css";
import servingStyles from "./recipe-serving-plan.module.css";

const slots: MealSlot[] = ["breakfast", "lunch", "snack", "dinner"];
const formatPortions = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 3 });
const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type RecipeServingPlanProps = {
  recipe: Recipe;
  state: HouseholdState;
  run: (operation: PilotOperation) => Promise<boolean>;
  onPlanned: () => void;
  portionsDraft?: string;
  onPortionsChange?: (value: string) => void;
  renderGroceries?: (portions: number, prepareDate: string) => ReactNode;
};

export function RecipeServingPlan({ recipe, state, run, onPlanned, portionsDraft, onPortionsChange, renderGroceries }: RecipeServingPlanProps) {
  const [today, setToday] = useState(() => localDate(new Date()));
  const [intent, setIntent] = useState<"tonight" | "ahead" | null>(null);
  const [planDraft, setDraft] = useState<ServingPlanDraft>(() => ({ totalPortions: recipe.servings, prepareDate: today, allocations: [] }));
  const totalText = portionsDraft ?? (Number.isNaN(planDraft.totalPortions) ? "" : String(planDraft.totalPortions));
  const draft = { ...planDraft, totalPortions: totalText.trim() ? Number(totalText) : NaN };
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const validation = buildServingPlan(state, recipe, draft, batchId);
  // Changes that affect the reviewed meals or grocery preview require review again.
  const reviewKey = JSON.stringify([recipe, draft, state.pantry, state.pilot?.members, state.pilot?.coverage, state.pilot?.allocations, state.pilot?.batches, state.pilot?.stock, state.pilot?.packageStock, state.pilot?.stockChecks, state.pilot?.shopThrough]);
  const reviewed = reviewedKey === reviewKey && validation.ok;
  const members = state.pilot?.members ?? [];
  const allocated = draft.allocations.reduce((sum, row) => sum + (Number.isFinite(row.portions) ? row.portions : 0), 0);
  const remaining = Number.isFinite(draft.totalPortions) ? Math.max(0, draft.totalPortions - allocated) : 0;

  function chooseIntent(next: "tonight" | "ahead") {
    const currentDate = localDate(new Date());
    setToday(currentDate);
    setIntent(next);
    setNotice("");
    if (next === "tonight") setDraft((current) => ({ ...current, prepareDate: currentDate }));
    else setDraft((current) => ({ ...current, prepareDate: current.prepareDate > currentDate ? current.prepareDate : addDays(currentDate, 1) }));
  }
  function updateRow(rowId: string, patch: Partial<ServingAllocationDraft>) {
    setNotice("");
    setDraft((current) => ({ ...current, allocations: current.allocations.map((row) => row.id === rowId ? { ...row, ...patch } : row) }));
  }
  function addAllocation() {
    const audience = members.filter((member) => state.pilot?.session.memberIds.includes(member.id));
    const preferredMembers = audience.length ? audience : members;
    const occupied = [...(state.pilot?.allocations ?? []), ...(state.pilot?.coverage ?? []), ...draft.allocations];
    let nextMeal: Pick<ServingAllocationDraft, "memberId" | "date" | "slot"> | undefined;
    for (let offset = 0; offset <= 200 && !nextMeal; offset++) {
      const date = addDays(draft.prepareDate, offset);
      const member = preferredMembers.find((person) => !occupied.some((meal) => meal.memberId === person.id && meal.date === date && meal.slot === "dinner"));
      if (member) nextMeal = { memberId: member.id, date, slot: "dinner" };
    }
    if (!nextMeal) { setNotice("Choose another preparation date to find an open meal."); return; }
    const meal = nextMeal;
    setNotice("");
    setDraft((current) => ({ ...current, allocations: [...current.allocations, { id: crypto.randomUUID(), ...meal, portions: Math.min(1, Math.max(0, draft.totalPortions - allocated)) || 1 }] }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    // Do not reuse a previously accepted draft: another device may have covered a meal.
    const current = buildServingPlan(state, recipe, draft, batchId);
    if (!current.ok) { setNotice(current.errors[0]); return; }
    if (!reviewed) { setReviewedKey(reviewKey); setNotice(""); return; }
    savingRef.current = true;
    setSaving(true);
    setNotice("");
    try {
      if (await run(current.operation)) {
        setIntent(null);
        setDraft({ totalPortions: recipe.servings, prepareDate: localDate(new Date()), allocations: [] });
        setReviewedKey(null);
        setBatchId(crypto.randomUUID());
        onPlanned();
      }
      else setNotice("This plan was not saved. Your choices are kept here; review the latest household state and retry.");
    } catch {
      setNotice("This plan was not saved. Your choices are kept here; try again when the connection is ready.");
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <form className={styles.details} onSubmit={(event) => void submit(event)} aria-label={`Plan servings for ${recipe.name}`}>
    <fieldset disabled={saving} className={servingStyles.fields}>
      <legend className={servingStyles.heading}>When would you like to make it?</legend>
      <div className={styles.buttonRow}>
        <button className={`${styles.quietButton} ${intent === "tonight" ? styles.primary : ""}`} type="button" aria-pressed={intent === "tonight"} onClick={() => chooseIntent("tonight")}><CookingPot size={14} />Cook tonight</button>
        <button className={`${styles.quietButton} ${intent === "ahead" ? styles.primary : ""}`} type="button" aria-pressed={intent === "ahead"} onClick={() => chooseIntent("ahead")}><CalendarDays size={14} />Plan ahead</button>
      </div>
      {intent ? <>
        <p className={styles.formNotice}>{intent === "tonight" ? `Plan preparation for today, ${dateLabel(today)}.` : "Choose when you intend to prepare this batch."} You’ll confirm cooking after you’ve made it.</p>
        {intent === "ahead" ? <label className={styles.field}>Prepare on<input className={styles.input} type="date" required value={draft.prepareDate} onChange={(event) => { setNotice(""); setDraft((current) => ({ ...current, prepareDate: event.target.value })); }} /></label> : null}
        <label className={styles.field}>How many portions will you make in total?<input className={styles.input} type="number" required min={0.001} max={1000} step="any" value={totalText} onChange={(event) => { const value = event.target.value; setNotice(""); setDraft((current) => ({ ...current, totalPortions: value === "" ? NaN : Number(value) })); onPortionsChange?.(value); }} /></label>
        <p className={styles.subtle}>Start with the whole batch. Then decide who will eat it and when.</p>
        <h4 className={servingStyles.heading}>Distribute portions</h4>
        {draft.allocations.length ? draft.allocations.map((row, index) => <fieldset className={servingStyles.allocation} key={row.id}>
          <legend>Meal {index + 1}</legend>
          <div className={styles.fieldRow}>
            <label className={styles.field}>Person<select className={styles.select} required value={row.memberId} onChange={(event) => updateRow(row.id, { memberId: event.target.value })}>{!members.some((member) => member.id === row.memberId) ? <option value={row.memberId}>Choose a current person</option> : null}{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
            <label className={styles.field}>Portions<input className={styles.input} type="number" required min={0.001} max={1000} step="any" value={Number.isNaN(row.portions) ? "" : row.portions} onChange={(event) => updateRow(row.id, { portions: event.target.value === "" ? NaN : Number(event.target.value) })} /></label>
            <label className={styles.field}>Date<input className={styles.input} type="date" required min={draft.prepareDate} value={row.date} onChange={(event) => updateRow(row.id, { date: event.target.value })} /></label>
            <label className={styles.field}>Meal<select className={styles.select} value={row.slot} onChange={(event) => updateRow(row.id, { slot: event.target.value as MealSlot })}>{slots.map((slot) => <option value={slot} key={slot}>{slot[0].toUpperCase() + slot.slice(1)}</option>)}</select></label>
          </div>
          <button type="button" className={styles.smallButton} aria-label={`Remove meal ${index + 1}`} onClick={() => { setNotice(""); setDraft((current) => ({ ...current, allocations: current.allocations.filter((entry) => entry.id !== row.id) })); }}><Trash2 size={12} />Remove</button>
        </fieldset>) : <p className={styles.subtle}>You can schedule meals now or keep the entire batch for later.</p>}
        <button type="button" className={styles.smallButton} disabled={!members.length || draft.allocations.length >= 200 || !Number.isFinite(draft.totalPortions) || !draft.prepareDate || remaining <= 0} onClick={addAllocation}><Plus size={12} />Add a meal</button>
        <div className={servingStyles.balance} aria-live="polite"><span>{formatPortions(allocated)} allocated</span><strong>{formatPortions(remaining)} for later / freezer</strong></div>
        <p className={styles.formNotice}>Unallocated portions stay reserved in this batch. Confirm the actual freezer amount when you record cooking.</p>
        {!validation.ok ? <ul className={servingStyles.errors}>{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
        {renderGroceries?.(draft.totalPortions, draft.prepareDate)}
        {reviewed && validation.ok ? <section className={servingStyles.review} aria-label="Review serving plan"><h4 className={servingStyles.heading}>Review your batch</h4><p>Prepare <strong>{formatPortions(draft.totalPortions)} portions</strong> on {dateLabel(draft.prepareDate)}.</p>{draft.allocations.length ? <ul>{draft.allocations.map((row) => <li key={row.id}>{members.find((member) => member.id === row.memberId)?.name} · {dateLabel(row.date)} {row.slot} · {formatPortions(row.portions)} {row.portions === 1 ? "portion" : "portions"}</li>)}</ul> : null}<p>{formatPortions(validation.reservedPortions)} portions for later / freezer.</p></section> : null}
        {notice ? <p role="alert" className={styles.formNotice}>{notice}</p> : null}
        <button className={`${styles.quietButton} ${styles.primary} ${styles.fullWidth}`} type="submit" disabled={saving || !validation.ok}>{saving ? "Saving…" : reviewed ? `Save ${formatPortions(draft.totalPortions)}-portion plan` : "Review portions and meals"}</button>
        <p className={styles.formNotice}>Ingredients count once for the total batch. Planning keeps pantry stock unchanged.</p>
      </> : null}
    </fieldset>
  </form>;
}
