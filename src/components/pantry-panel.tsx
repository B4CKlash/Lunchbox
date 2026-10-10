"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight, Camera, ClipboardPaste, Leaf, Package, Plus, X } from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import {
  inferPantryCategory,
  pantryCategories,
  pantryCategoryLabel,
} from "@/features/pantry/categories";
import {
  pantryItemSchema,
  unitSchema,
  type KnownIngredient,
  type PantryCategory,
  type PantryItem,
  type PantryTag,
} from "@/lib/contracts";
import { knownIngredientsFromHousehold, normalizeIngredientName, resolveIngredient } from "@/features/pantry/ingredients";
import { aggregatePantry } from "@/features/pantry/stock-projection";
import { pantryStockDisplay } from "@/features/pantry/stock-display";
import { applyPantryImport, PantryImportError, preparePantryImport, resolvePantryImportRow, type PantryImportRow } from "@/features/pantry/import";

const locations = ["Fridge", "Freezer", "Cupboard", "Garden"] as const;

export function PantryPanel() {
  const { householdResetVersion } = useHousehold();
  return <PantryContent key={householdResetVersion} />;
}

function PantryContent() {
  const { state, dispatchPilot } = useHousehold();
  const pantry = aggregatePantry(state.pantry, state.pilot?.stock);
  const [editor, setEditor] = useState<PantryItem | "new" | null>(null);
  const [filter, setFilter] = useState<"all" | "soon" | PantryCategory>("all");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [entryIntent, setEntryIntent] = useState<"set-total" | "add">("set-total");
  const [manualQuantity, setManualQuantity] = useState("");
  const [editorBasis, setEditorBasis] = useState("");
  const [reviewBasis, setReviewBasis] = useState("");
  const [ambiguous, setAmbiguous] = useState<KnownIngredient[]>([]);
  const knownIngredients = knownIngredientsFromHousehold(state);
  const [bulkText, setBulkText] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [defaultQuantity, setDefaultQuantity] = useState(1);
  const [defaultUnit, setDefaultUnit] = useState<PantryItem["unit"]>("each");
  const [defaultLocation, setDefaultLocation] = useState<PantryItem["location"]>("Cupboard");
  const [defaultTag, setDefaultTag] = useState<PantryTag>("special");
  const [receiptText, setReceiptText] = useState("");
  const [reviewRows, setReviewRows] = useState<PantryImportRow[]>([]);
  const [saving, setSaving] = useState(false);
  const stockFor = (item: PantryItem) => pantryStockDisplay(item, state.pilot?.stock);
  const useSoon = pantry.filter((item) => { const stock = stockFor(item); return stock.useSoon && stock.onHand; });
  const inStock = pantry.filter((item) => stockFor(item).onHand);
  const shown =
    filter === "all"
      ? pantry
      : filter === "soon"
        ? useSoon
        : pantry.filter((item) => inferPantryCategory(item) === filter);
  const editing = editor && editor !== "new" ? editor : null;
  const editingStock = editing ? stockFor(editing) : null;

  const stockBasis = JSON.stringify([pantry, state.pilot?.stock]);
  const editorStockBasis = (item: PantryItem) => JSON.stringify([pantry.find((entry) => entry.id === item.id && entry.unit === item.unit), state.pilot?.stock.find((entry) => entry.ingredientId === item.id && entry.unit === item.unit)]);
  const editorConflict = Boolean(editing && editorBasis !== editorStockBasis(editing));
  const reviewConflict = Boolean(reviewRows.length && reviewBasis !== stockBasis);

  function openEditor(item: PantryItem | "new") {
    setError(null);
    setMessage("");
    setEditor(item);
    setEntryIntent("set-total");
    setManualQuantity(item === "new" ? "1" : String(stockFor(item).quantity ?? ""));
    setEditorBasis(item === "new" ? "" : editorStockBasis(item));
    setAmbiguous([]);
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || editorConflict) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const unit = unitSchema.safeParse(form.get("unit"));
    if (!unit.success || !name) { setError("Enter an ingredient name and a supported unit."); return; }
    let id = editing?.id;
    if (editing && normalizeIngredientName(name) !== normalizeIngredientName(editing.name)) {
      const renamed = resolveIngredient({ name, unit: unit.data }, knownIngredients);
      if (renamed.status !== "resolved" || renamed.ingredient.ingredientId !== editing.id) {
        setError("This name describes a different ingredient. Add it as a new pantry item so existing recipes keep the right stock.");
        return;
      }
    }
    if (!id) {
      const resolution = resolveIngredient({ name, unit: unit.data, ingredientId: String(form.get("ingredientId") ?? "") || undefined }, knownIngredients);
      if (resolution.status === "ambiguous") {
        setAmbiguous(resolution.candidates);
        setError("Choose the ingredient you mean below. Existing entries will stay separate.");
        return;
      }
      id = resolution.ingredient.ingredientId;
      const existing = pantry.find((item) => item.id === id && item.unit === unit.data);
      if (existing) {
        const quantity = String(form.get("quantity") ?? "");
        const intent = entryIntent;
        openEditor(existing);
        setEntryIntent(intent); setManualQuantity(quantity);
        setMessage("This ingredient is already in your pantry. Review its current stock and the entry meaning before saving.");
        return;
      }
    }
    const result = pantryItemSchema.safeParse({
      id,
      name,
      quantity: Number(form.get("quantity")),
      restockBelow: Number(form.get("restockBelow")),
      unit: form.get("unit"),
      location: form.get("location"),
      useSoon: form.get("useSoon") === "on",
      tag: form.get("tag"),
      category: form.get("category"),
    });
    if (!result.success) {
      setError(
        "Please check the ingredient name, amount, and storage location.",
      );
      return;
    }
    if (!editing && pantry.length >= 200) {
      setError("This sample kitchen can hold up to 200 ingredients.");
      return;
    }
    setSaving(true);
    const saved = await dispatchPilot({ type: "record_stock_entries", entries: [{ intent: entryIntent, item: result.data }] });
    setSaving(false);
    if (!saved.ok) { setError(saved.error ?? "The pantry change was not saved. Try again."); return; }
    setMessage(
      `${result.data.name}: ${entryIntent === "add" ? "purchase recorded" : "current total saved"}.`,
    );
    setEditor(null);
  }

  function prepareImport(source: "list" | "receipt") {
    try {
      setReviewRows(preparePantryImport(source === "list" ? bulkText : receiptText, source, {
        quantity: defaultQuantity, unit: defaultUnit, location: defaultLocation, tag: defaultTag,
      }, pantry, knownIngredients));
      setReviewBasis(stockBasis);
      setError(null);
      setMessage("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Check the pasted ingredients and try again.");
    }
  }

  function updateImportRow(index: number, change: Partial<PantryImportRow>, resolve = false) {
    setReviewRows((rows) => rows.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...change };
      return resolve ? resolvePantryImportRow(next, knownIngredients) : next;
    }));
    setError(null);
  }

  async function saveImport() {
    if (saving) return;
    try {
      if (reviewConflict) throw new Error("Kitchen stock changed. Compare the current amounts and refresh the review before saving.");
      const result = applyPantryImport(pantry, reviewRows, knownIngredients);
      setSaving(true);
      const saved = await dispatchPilot(result.operation);
      if (!saved.ok) { setError(saved.error ?? "The pantry import was not saved. Try again."); return; }
      setEditor(null);
      setAmbiguous([]);
      setReviewRows([]); setBulkText(""); setReceiptText(""); setError(null);
      setMessage(`${result.added} added and ${result.updated} existing ${result.updated === 1 ? "item updated" : "items updated"}.`);
    } catch (reason) {
      if (reason instanceof PantryImportError && reason.rowIndex !== undefined && reason.candidates) {
        const index = reason.rowIndex;
        setReviewRows((rows) => rows.map((row, i) => i === index ? { ...row, ingredientId: null, candidates: reason.candidates! } : row));
      }
      setError(reason instanceof Error ? reason.message : "These pantry items could not be saved. Check the review rows.");
    } finally { setSaving(false); }
  }

  function capturePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setPhotoName(file.name);
    openEditor("new");
    setMessage("Photo captured. Automatic food, receipt, and barcode recognition needs a connected recognition service; add the identified item below.");
  }

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">YOUR KITCHEN, CONNECTED</p>
          <h1>Good food starts here.</h1>
          <p>Know what you have. Make a little more of it.</p>
        </div>
        <button
          className="button"
          disabled={pantry.length >= 200}
          onClick={() => openEditor("new")}
        >
          <Plus size={17} aria-hidden="true" /> Add ingredient
        </button>
      </header>

      <section className="card pantry-import" aria-label="Add pantry items">
        <div>
          <h2><ClipboardPaste size={18} aria-hidden="true" /> Add a list</h2>
          <p className="muted">Paste names separated by commas or new lines, then review the current totals before saving.</p>
          <textarea aria-label="Ingredient names" value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder="Apples, rice, black beans" rows={3} />
          <div className="import-defaults">
            <label className="field">Default amount<input type="number" min="0.01" max="100000" step="any" value={defaultQuantity} onChange={(event) => setDefaultQuantity(Number(event.target.value))} /></label>
            <label className="field">Unit<select value={defaultUnit} onChange={(event) => setDefaultUnit(event.target.value as PantryItem["unit"])}><option value="each">each</option><option value="g">grams (g)</option><option value="ml">milliliters (ml)</option></select></label>
            <label className="field">Storage<select value={defaultLocation} onChange={(event) => setDefaultLocation(event.target.value as PantryItem["location"])}>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
            <label className="field">Pantry tag<select value={defaultTag} onChange={(event) => setDefaultTag(event.target.value as PantryTag)}><option value="staple">Staple</option><option value="seasonal">Seasonal</option><option value="special">Special</option></select></label>
          </div>
          <button className="button secondary" onClick={() => prepareImport("list")}>Review list</button>
          <h3 className="receipt-title">Paste receipt text</h3>
          <p className="muted">Paste or type receipt lines. Totals and common payment lines are filtered; check the purchase amounts in the preview.</p>
          <textarea aria-label="Receipt text" value={receiptText} onChange={(event) => setReceiptText(event.target.value)} placeholder={'Milk  $3.49\nApples  $4.20'} rows={3} />
          <button className="button secondary" onClick={() => prepareImport("receipt")}>Review receipt items</button>
        </div>
        <div>
          <h2><Camera size={18} aria-hidden="true" /> Use your camera</h2>
          <p className="muted">Take a photo of an item, receipt, or barcode on your phone, then enter the identified item.</p>
          <label className="button secondary camera-button">
            <Camera size={16} aria-hidden="true" /> Take a photo
            <input type="file" accept="image/*" capture="environment" onChange={capturePhoto} aria-label="Take a pantry photo" />
          </label>
          {photoName ? <p className="small muted">Captured: {photoName}</p> : null}
        </div>
      </section>
      {reviewRows.length > 0 ? <section className="card import-review" aria-labelledby="review-import-heading">
        <div className="section-heading"><div><p className="eyebrow">CHECK BEFORE SAVING</p><h2 id="review-import-heading">Review pantry items</h2></div><button className="icon-button" aria-label="Close import review" onClick={() => setReviewRows([])}><X size={20} /></button></div>
        {reviewRows.map((row, index) => {
          const existing = pantry.find((item) => item.id === row.ingredientId && item.unit === row.unit);
          return <div className="import-review-row" key={index}>
            <label className="field">Item name<input value={row.name} maxLength={80} onChange={(event) => updateImportRow(index, { name: event.target.value, ingredientId: null, candidates: [] })} onBlur={() => updateImportRow(index, {}, true)} /></label>
            <label className="field">{row.intent === "add" ? "Amount purchased" : "Current total"}<input type="number" min={row.intent === "add" ? "0.001" : "0"} max="100000" step="any" value={row.quantity} onChange={(event) => updateImportRow(index, { quantity: Number(event.target.value) })} /></label>
            <label className="field">Unit<select value={row.unit} onChange={(event) => updateImportRow(index, { unit: event.target.value as PantryItem["unit"], ingredientId: null, candidates: [] }, true)}><option value="each">each</option><option value="g">g</option><option value="ml">ml</option></select></label>
            <label className="field">Storage<select value={row.location} onChange={(event) => updateImportRow(index, { location: event.target.value as PantryItem["location"] })}>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
            <label className="field">Tag<select value={row.tag} onChange={(event) => updateImportRow(index, { tag: event.target.value as PantryTag })}><option value="staple">Staple</option><option value="seasonal">Seasonal</option><option value="special">Special</option></select></label>
            {row.candidates.length > 0 ? <label className="field">Match this ingredient
              <select value={row.ingredientId ?? ""} onChange={(event) => updateImportRow(index, { ingredientId: event.target.value || null })}>
                <option value="">Choose an existing ingredient</option>
                {row.candidates.map((candidate) => {
                  const stock = pantry.find((item) => item.id === candidate.ingredientId && item.unit === candidate.unit);
                  return <option key={candidate.ingredientId} value={candidate.ingredientId}>{candidate.name} · {stock ? `${stockFor(stock).label} in ${stock.location}` : `saved recipe (${candidate.unit})`}</option>;
                })}
              </select>
            </label> : null}
            <label className="field">Entry meaning<select value={row.intent} onChange={(event) => updateImportRow(index, { intent: event.target.value as PantryImportRow["intent"] })}><option value="set-total">Set current total</option><option value="add">Add a purchase</option></select></label>
            {existing ? <p className="small muted">Current stock: {stockFor(existing).label}. {row.intent === "add" ? "This purchase adds stock; an unknown balance stays unknown." : "This amount replaces the combined total."}</p> : null}
            <button className="text-button" onClick={() => setReviewRows((rows) => rows.filter((_, i) => i !== index))}>Remove</button>
          </div>;
        })}
        {reviewConflict ? <p className="error-message" role="alert">Kitchen stock changed while this review was open. Your entries are kept. Compare the current amounts above, then <button className="text-button" onClick={() => setReviewBasis(stockBasis)}>Refresh stock comparison</button>.</p> : null}
        <div className="actions"><button className="button secondary" onClick={() => setReviewRows([])}>Cancel</button><button className="button" disabled={saving || reviewConflict || !reviewRows.length} onClick={() => void saveImport()}>{saving ? "Saving…" : "Save reviewed items"}</button></div>
      </section> : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
      <p className="status-message" role="status">{message}</p>

      <div className="stats-strip" aria-label="Pantry overview">
        <div className="stat">
          <span className="stat-icon">
            <Package size={21} aria-hidden="true" />
          </span>
          <strong>{inStock.length}</strong>
          <span>
            ingredients
            <br />
            on hand
          </span>
        </div>
        <div className="stat">
          <span className="stat-icon warm">
            <Leaf size={21} aria-hidden="true" />
          </span>
          <strong>{useSoon.length}</strong>
          <span>
            ingredients
            <br />
            to use soon
          </span>
        </div>
        <div className="stat">
          <span className="stat-icon">
            <span aria-hidden="true">↗</span>
          </span>
          <strong>{new Set(inStock.map((item) => item.location)).size}</strong>
          <span>
            storage spots
            <br />
            with good things
          </span>
        </div>
      </div>

      {editor !== null ? (
        <section
          className="card ingredient-editor"
          aria-labelledby="editor-heading"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">A QUICK KITCHEN CHECK</p>
              <h2 id="editor-heading">
                {editing
                  ? "Keep your pantry up to date."
                  : "A little more in your kitchen."}
              </h2>
            </div>
            <button
              className="icon-button"
              aria-label="Close ingredient form"
              onClick={() => setEditor(null)}
            >
              <X size={20} />
            </button>
          </div>
          {editingStock?.uncertain ? <p className="muted">Current stock: {editingStock.label}. {entryIntent === "set-total" ? "Enter a measured total to replace this uncertainty." : "A purchase keeps the prior balance unknown."} <Link href="/shopping">Keep or edit a qualitative amount in Shopping.</Link></p> : null}
          <form key={editing ? `${editing.id}:${editing.unit}:${editorBasis}` : "new"} onSubmit={(event) => void saveItem(event)}>
            <div className="ingredient-fields">
              <label className="field ingredient-name">
                Ingredient name
                <input
                  name="name"
                  list="known-ingredient-names"
                  placeholder="e.g. Cherry tomatoes"
                  defaultValue={editing?.name ?? ""}
                  maxLength={80}
                  required
                  autoFocus
                  onChange={(event) => {
                    setAmbiguous([]);
                    if (editing) return;
                    const exact = knownIngredients.filter((item) => normalizeIngredientName(item.name) === normalizeIngredientName(event.currentTarget.value));
                    if (exact.length === 1) {
                      const unitInput = event.currentTarget.form?.elements.namedItem("unit");
                      if (unitInput instanceof HTMLSelectElement) unitInput.value = exact[0].unit;
                    }
                  }}
                />
                <datalist id="known-ingredient-names">
                  {knownIngredients.map((item) => <option key={`${item.ingredientId}:${item.unit}`} value={item.name}>{item.unit}</option>)}
                </datalist>
              </label>
              <label className="field">
                Entry meaning
                <select value={entryIntent} onChange={(event) => { const intent = event.target.value as typeof entryIntent; setEntryIntent(intent); setManualQuantity(intent === "add" ? "" : String(editingStock?.quantity ?? "")); }}>
                  <option value="set-total">Set current total</option><option value="add">Add a purchase</option>
                </select>
              </label>
              <label className="field">
                {entryIntent === "add" ? "Amount purchased" : "Measured total amount"}
                <input
                  name="quantity"
                  type="number"
                  min={entryIntent === "add" ? "0.001" : "0"}
                  max="100000"
                  step="any"
                  value={manualQuantity}
                  onChange={(event) => setManualQuantity(event.target.value)}
                  placeholder={entryIntent === "add" ? "What you brought home" : "Enter a measured total"}
                  required
                />
              </label>
              <label className="field">
                Unit
                {editing ? <input type="hidden" name="unit" value={editing.unit} /> : null}
                <select name="unit" defaultValue={editing?.unit ?? "each"} disabled={Boolean(editing)}>
                  <option value="each">each</option>
                  <option value="g">grams (g)</option>
                  <option value="ml">milliliters (ml)</option>
                </select>
              </label>
              <label className="field">
                Restock staple below
                <input name="restockBelow" type="number" min="0" max="100000" step="any" defaultValue={editing?.restockBelow ?? 0} />
              </label>
              <label className="field">
                Storage
                <select
                  name="location"
                  defaultValue={editing?.location ?? "Fridge"}
                >
                  {locations.map((location) => (
                    <option key={location}>{location}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Pantry tag
                <select name="tag" defaultValue={editing?.tag ?? "special"}>
                  <option value="staple">Staple</option>
                  <option value="seasonal">Seasonal</option>
                  <option value="special">Special</option>
                </select>
              </label>
              <label className="field">
                Food group
                <select
                  name="category"
                  defaultValue={
                    editing ? inferPantryCategory(editing) : "other"
                  }
                >
                  {pantryCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {ambiguous.length > 0 ? <label className="field">
              Match this ingredient
              <select name="ingredientId" required defaultValue="">
                <option value="" disabled>Choose an existing ingredient</option>
                {ambiguous.map((item) => <option key={item.ingredientId} value={item.ingredientId}>{item.name} ({item.unit})</option>)}
              </select>
            </label> : null}
            <p className="muted">{entryIntent === "add" ? "Adds what you bought and records purchase history. An unknown prior balance stays unknown." : "Replaces the combined amount for this ingredient and unit. Enter the total you measured, including any earlier entries."}</p>
            {editing ? <p className="small muted">Add a separate entry to record stock in another unit.</p> : null}
            {editorConflict ? <p className="error-message" role="alert">This stock changed while you were editing. Your draft is kept. <button type="button" className="text-button" onClick={() => { const current = pantry.find((item) => item.id === editing?.id && item.unit === editing?.unit); if (current) openEditor(current); }}>Load current stock</button></p> : null}
            <div className="form-footer">
              <label className="checkbox-label">
                <input
                  name="useSoon"
                  type="checkbox"
                  defaultChecked={editingStock?.useSoon ?? false}
                />{" "}
                Use this soon
              </label>
              <div className="actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditor(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="button" disabled={saving || editorConflict}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Add to pantry"}
                </button>
              </div>
            </div>
            {error ? (
              <p className="error-message" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}
      <p className="status-message" role="status">
        {message}
      </p>
      {pantry.length >= 200 ? (
        <p className="footnote">
          Your sample kitchen holds up to 200 ingredients. You can still edit
          the ingredients below.
        </p>
      ) : null}

      <section className="card pantry-card" aria-labelledby="pantry-heading">
        <div className="table-heading">
          <div>
            <h2 id="pantry-heading">Your pantry</h2>
            <p className="muted">A small inventory with a big part to play.</p>
          </div>
          <div className="segmented-control pantry-filters" aria-label="Filter pantry">
            <button
              className={filter === "all" ? "selected" : ""}
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All ingredients
            </button>
            <button
              className={filter === "soon" ? "selected" : ""}
              aria-pressed={filter === "soon"}
              onClick={() => setFilter("soon")}
            >
              Use soon <span>{useSoon.length}</span>
            </button>
            {pantryCategories.map((category) => {
              const count = pantry.filter(
                (item) => inferPantryCategory(item) === category.value,
              ).length;
              return (
                <button
                  key={category.value}
                  className={filter === category.value ? "selected" : ""}
                  aria-pressed={filter === category.value}
                  onClick={() => setFilter(category.value)}
                >
                  {category.label} <span>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        {shown.length ? (
          <div className="table-scroll">
            <table className="pantry-table">
              <thead>
                <tr>
                  <th scope="col">Ingredient</th>
                  <th scope="col">On hand</th>
                  <th scope="col">Food group</th>
                  <th scope="col">Storage</th>
                  <th scope="col">Tag</th>
                  <th scope="col">Keep in mind</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => {
                  const stock = stockFor(item);
                  return (
                  <tr key={`${item.id}:${item.unit}`}>
                    <td>
                      <span
                        className={`ingredient-dot ${stock.useSoon && stock.onHand ? "soon" : ""}`}
                        aria-hidden="true"
                      />
                      <strong>{item.name}</strong>
                    </td>
                    <td className="quantity">
                      {stock.label}
                    </td>
                    <td>
                      <span className="category-label">
                        {pantryCategoryLabel(inferPantryCategory(item))}
                      </span>
                    </td>
                    <td>
                      <span className="location-label">{[...new Set(state.pantry.filter((entry) => entry.id === item.id && entry.unit === item.unit).map((entry) => entry.location))].join(", ") || item.location}</span>
                    </td>
                    <td><span className={`pantry-tag tag-${item.tag}`}>{item.tag}</span></td>
                    <td>
                      {!stock.onHand ? (
                        <span className="muted small">Out of stock</span>
                      ) : stock.useSoon ? (
                        <span className="pill warm">Use soon</span>
                      ) : (
                        <span className="muted small">{stock.uncertain ? "Check amount before cooking" : "Ready when you are"}</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => openEditor(item)}
                        aria-label={`Edit ${item.name}`}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Leaf size={30} aria-hidden="true" />
            <h3>
              {filter === "soon"
                ? "Nothing needs the spotlight."
                : filter === "all"
                  ? "Make yourself at home."
                  : `No ${pantryCategoryLabel(filter).toLowerCase()} here yet.`}
            </h3>
            <p>
              {filter === "soon"
                ? "Mark an ingredient “Use this soon” to find it here."
                : filter === "all"
                  ? "Add your first ingredient to start filling your pantry."
                  : "Edit an ingredient’s food group or add something new."}
            </p>
            {filter === "all" ? (
              <button
                className="button secondary"
                onClick={() => openEditor("new")}
              >
                Add an ingredient
              </button>
            ) : null}
          </div>
        )}
      </section>

      <aside className="next-step">
        <div>
          <span className="eyebrow">FROM ON HAND TO ON THE TABLE</span>
          <h2>A good dinner might already be here.</h2>
          <p>Find a few meal ideas around what’s in your kitchen.</p>
        </div>
        <Link className="button" href="/meals">
          Find a meal <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </aside>
    </>
  );
}
