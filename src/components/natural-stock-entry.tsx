"use client";

import { useRef, useState } from "react";
import { useHousehold } from "@/components/household-provider";
import { knownIngredientsFromHousehold } from "@/features/pantry/ingredients";
import { naturalStockEntryOperation, packageStockLabel, prepareNaturalStockEntry, resolveNaturalStockIdentity, type NaturalStockEntryDraft } from "@/features/pantry/natural-stock-entry";
import { assertNaturalStockReviewCurrent, captureNaturalStockReview, type NaturalStockReview } from "@/features/pantry/natural-stock-review";
import { packageKindSchema, type PackageKind, type Unit } from "@/lib/contracts";

/** One reviewed entry surface for measured stock and unresolved containers. */
export function NaturalStockEntry() {
  const { state, ready, dispatchPilot } = useHousehold();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<NaturalStockEntryDraft | null>(null);
  const [review, setReview] = useState<NaturalStockReview | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const known = knownIngredientsFromHousehold(state);
  function beginReview(value: NaturalStockEntryDraft) {
    setDraft(value);
    setReview(captureNaturalStockReview(state));
  }
  function resolveName(value: NaturalStockEntryDraft) {
    if (!value.name.trim()) return;
    setDraft(resolveNaturalStockIdentity(value, known));
  }
  return <section className="card" aria-labelledby="natural-stock-heading">
    <div className="section-heading"><div><p className="eyebrow">SAY WHAT YOU HAVE</p><h2 id="natural-stock-heading">A quick stock update</h2></div></div>
    <p className="muted">Try “I have 10 apples”, “I bought 1000 g beans”, or “I have 10 cans of beans”. Container contents stay unknown until measured.</p>
    <form onSubmit={(event) => {
      event.preventDefault(); setError(""); setMessage("");
      try { beginReview(prepareNaturalStockEntry(text, known)); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Check your stock statement."); }
    }}>
      <label className="field">Stock statement<input value={text} maxLength={1000} onChange={(event) => setText(event.target.value)} placeholder="I have half a jar of tomato sauce" /></label>
      <button className="button secondary" type="submit" disabled={!ready || saving || !text.trim()}>Review stock update</button>
    </form>
    {draft ? <form onSubmit={async (event) => {
      event.preventDefault(); if (savingRef.current) return;
      savingRef.current = true; setError(""); setSaving(true);
      try {
        assertNaturalStockReviewCurrent(review, state, draft);
        const result = await dispatchPilot(naturalStockEntryOperation(draft));
        if (!result.ok) throw new Error(result.error ?? "The stock update could not be saved.");
        setDraft(null); setText(""); setMessage("Stock update saved. Container contents are never converted automatically.");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "The stock update could not be saved."); }
      finally { savingRef.current = false; setSaving(false); }
    }}>
      <fieldset disabled={saving}><legend>Review the meaning and ingredient</legend>
        <p className="muted small">Original statement: {draft.originalText}</p>
        <label className="field">Meaning<select value={draft.operation ?? ""} onChange={(event) => setDraft({ ...draft, operation: event.target.value as NaturalStockEntryDraft["operation"] || null })}>
          <option value="">Choose meaning</option><option value="set_total">Replace the current total</option><option value="add_purchase">Record a purchase to add</option>
        </select></label>
        <label className="field">Ingredient<input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value, ingredientId: null, candidates: [] })} onBlur={() => resolveName(draft)} /></label>
        {draft.candidates.length ? <label className="field">Choose the ingredient<select value={draft.ingredientId ?? ""} onChange={(event) => setDraft({ ...draft, ingredientId: event.target.value || null, name: draft.candidates.find((entry) => entry.ingredientId === event.target.value)?.name ?? draft.name })}><option value="">Choose identity</option>{draft.candidates.map((entry) => <option key={entry.ingredientId} value={entry.ingredientId}>{entry.name}</option>)}</select></label> : null}
        <label className="field">Amount means<select value={draft.packageKind ?? draft.unit ?? ""} onChange={(event) => {
          const value = event.target.value;
          const kind = packageKindSchema.safeParse(value);
          setDraft({ ...draft, packageKind: kind.success ? kind.data : null, unit: kind.success ? null : value ? value as Unit : null });
        }}><option value="">Choose a unit</option><option value="g">grams</option><option value="ml">milliliters</option><option value="each">individual foods (each)</option>{packageKindSchema.options.map((kind) => <option key={kind} value={kind}>{kind === "box" ? "boxes" : `${kind}s`} · contents unknown</option>)}</select></label>
        <label className="field">Certainty<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as NaturalStockEntryDraft["status"], amount: event.target.value === "exact" ? draft.amount : null })}><option value="exact">Exact amount or whole container count</option><option value="some">Some · amount unknown</option><option value="low">Low · amount unknown</option><option value="out">Out</option></select></label>
        {draft.status === "exact" ? <label className="field">{draft.packageKind ? "Whole container count" : "Measured amount"}<input type="number" min="0" max="100000" step={draft.packageKind ? "1" : "any"} value={draft.amount ?? ""} onChange={(event) => setDraft({ ...draft, amount: event.target.value === "" ? null : Number(event.target.value) })} /></label> : null}
        {draft.packageKind ? <p className="muted small">Containers can have different sizes. Shopping will ask you to check their usable contents; cooking will leave the remaining count unknown.</p> : null}
        <div className="actions"><button className="button secondary" type="button" onClick={() => setDraft(null)}>Cancel</button><button className="button" type="submit">{saving ? "Saving…" : "Save reviewed stock"}</button></div>
      </fieldset>
    </form> : null}
    {error ? <p className="error-message" role="alert">{error}</p> : null}
    {message ? <p className="status-message" role="status">{message}</p> : null}
    {state.pilot?.packageStock.length ? <><h3>Containers on hand</h3><ul>{state.pilot.packageStock.map((stock) => <li key={`${stock.ingredientId}:${stock.packageKind}`}><strong>{stock.name}</strong> · {packageStockLabel(stock)} · contents unresolved <button className="text-button" type="button" disabled={saving} onClick={() => {
      beginReview({ originalText: stock.sourceNote ?? `${stock.name}: ${packageStockLabel(stock)}`, name: stock.name, ingredientId: stock.ingredientId, candidates: [], operation: "set_total", status: stock.status, amount: stock.count ?? null, unit: null, packageKind: stock.packageKind as PackageKind }); setError(""); setMessage("");
    }}>Update</button></li>)}</ul></> : <p className="muted small">No container stock recorded yet.</p>}
  </section>;
}
