"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight, Camera, ClipboardPaste, Leaf, Package, Plus, X } from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import { pantryItemSchema, type PantryItem, type PantryTag } from "@/lib/contracts";
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
} from "@/lib/contracts";
import { knownIngredientsFromHousehold, normalizeIngredientName, resolveIngredient } from "@/features/pantry/ingredients";

const locations = ["Fridge", "Freezer", "Cupboard", "Garden"] as const;
const amount = (quantity: number, unit: string) =>
  `${quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${unit}`;
type ImportRow = { name: string; quantity: number; unit: PantryItem["unit"]; location: PantryItem["location"]; tag: PantryTag; merge: boolean };

export function PantryPanel() {
  const { householdResetVersion } = useHousehold();
  return <PantryContent key={householdResetVersion} />;
}

function PantryContent() {
  const { state, setPantry } = useHousehold();
  const [editor, setEditor] = useState<PantryItem | "new" | null>(null);
  const [filter, setFilter] = useState<"all" | "soon" | PantryCategory>("all");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [ambiguous, setAmbiguous] = useState<KnownIngredient[]>([]);
  const knownIngredients = knownIngredientsFromHousehold(state);
  const [bulkText, setBulkText] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [defaultQuantity, setDefaultQuantity] = useState(1);
  const [defaultUnit, setDefaultUnit] = useState<PantryItem["unit"]>("each");
  const [defaultLocation, setDefaultLocation] = useState<PantryItem["location"]>("Cupboard");
  const [defaultTag, setDefaultTag] = useState<PantryTag>("special");
  const [receiptText, setReceiptText] = useState("");
  const [reviewRows, setReviewRows] = useState<ImportRow[]>([]);
  const useSoon = state.pantry.filter(
    (item) => item.useSoon && item.quantity > 0,
  );
  const inStock = state.pantry.filter((item) => item.quantity > 0);
  const shown =
    filter === "all"
      ? state.pantry
      : filter === "soon"
        ? useSoon
        : state.pantry.filter((item) => inferPantryCategory(item) === filter);
  const editing = editor && editor !== "new" ? editor : null;

  function openEditor(item: PantryItem | "new") {
    setError(null);
    setMessage("");
    setEditor(item);
    setEditingIndex(item === "new" ? null : state.pantry.indexOf(item));
    setAmbiguous([]);
  }

  function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const existing = state.pantry.find((item) => item.id === id && item.unit === unit.data);
      if (existing) {
        openEditor(existing);
        setMessage("This ingredient is already in your pantry. Update its total amount below.");
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
    if (!editing && state.pantry.length >= 200) {
      setError("This sample kitchen can hold up to 200 ingredients.");
      return;
    }
    if (editing && editing.unit !== unit.data && state.pantry.some((item, index) => index !== editingIndex && item.id === id && item.unit === unit.data)) {
      setError("This ingredient already has an entry in that unit. Edit that entry instead.");
      return;
    }
    setPantry(
      editing
        ? state.pantry.map((item, index) =>
            index === editingIndex ? result.data : item,
          )
        : [...state.pantry, result.data],
    );
    setMessage(
      `${result.data.name} ${editing ? "updated" : "added to your pantry"}.`,
    );
    setEditor(null);
  }

  function prepareImport(source: "list" | "receipt") {
    const input = source === "list" ? bulkText : receiptText;
    const candidates = input.split(/[\n,;]+/).map((line) => {
      let cleaned = line.trim().replace(/\s+\$\d+(?:\.\d{2})?\s*$/, "");
      const count = source === "receipt" ? cleaned.match(/^(\d+(?:\.\d+)?)\s+(.+)$/) : null;
      if (count) cleaned = count[2];
      return { name: cleaned.trim(), quantity: count ? Number(count[1]) : defaultQuantity };
    }).filter(({ name }) => name && !/^total|^subtotal|^tax|^change|^payment|^thank you/i.test(name));
    const unique = [...new Map(candidates.map((item) => [item.name.toLowerCase(), item])).values()];
    if (!unique.length) {
      setError("Paste ingredient names or receipt lines first.");
      return;
    }
    setReviewRows(unique.map(({ name, quantity }) => {
      const duplicate = state.pantry.find((item) => item.name.trim().toLowerCase() === name.toLowerCase() && item.unit === defaultUnit);
      return { name: name.slice(0, 80), quantity, unit: defaultUnit, location: defaultLocation, tag: duplicate?.tag ?? defaultTag, merge: Boolean(duplicate) };
    }));
    setError(null);
    setMessage("");
  }

  function saveImport() {
    const additions: PantryItem[] = [];
    const updates = new Map<string, PantryItem>();
    for (const row of reviewRows) {
      const duplicate = row.merge && state.pantry.find((item) => item.name.trim().toLowerCase() === row.name.trim().toLowerCase() && item.unit === row.unit);
      if (duplicate) {
        const current = updates.get(duplicate.id) ?? duplicate;
        const checked = pantryItemSchema.safeParse({ ...current, quantity: current.quantity + row.quantity, tag: row.tag });
        if (checked.success) updates.set(duplicate.id, checked.data);
      } else {
        const slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "ingredient";
        let id = slug; let suffix = 2;
        while (state.pantry.some((item) => item.id === id) || additions.some((item) => item.id === id)) id = `${slug}-${suffix++}`;
        const checked = pantryItemSchema.safeParse({ id, name: row.name, quantity: row.quantity, unit: row.unit, location: row.location, useSoon: false, tag: row.tag });
        if (checked.success) additions.push(checked.data);
      }
    }
    if (state.pantry.length + additions.length > 200) {
      setError(`There is room for ${Math.max(0, 200 - state.pantry.length)} new items. Remove some rows or merge duplicates.`);
      return;
    }
    const updated = state.pantry.map((item) => updates.get(item.id) ?? item);
    setPantry([...updated, ...additions]);
    const mergedCount = [...updates.keys()].length;
    setReviewRows([]); setBulkText(""); setReceiptText(""); setError(null);
    setMessage(`${additions.length} added and ${mergedCount} existing ${mergedCount === 1 ? "item updated" : "items updated"}.`);
  }

  function capturePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setPhotoName(file.name);
    setError(null);
    setMessage("Photo captured. Automatic food, receipt, and barcode recognition needs a connected recognition service; add the identified item below.");
    setEditor("new");
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
          disabled={state.pantry.length >= 200}
          onClick={() => openEditor("new")}
        >
          <Plus size={17} aria-hidden="true" /> Add ingredient
        </button>
      </header>

      <section className="card pantry-import" aria-label="Add pantry items">
        <div>
          <h2><ClipboardPaste size={18} aria-hidden="true" /> Add a list</h2>
          <p className="muted">Paste names separated by commas or new lines, then review before adding.</p>
          <textarea aria-label="Ingredient names" value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder="Apples, rice, black beans" rows={3} />
          <div className="import-defaults">
            <label className="field">Default amount<input type="number" min="0.01" max="100000" step="any" value={defaultQuantity} onChange={(event) => setDefaultQuantity(Number(event.target.value))} /></label>
            <label className="field">Unit<select value={defaultUnit} onChange={(event) => setDefaultUnit(event.target.value as PantryItem["unit"])}><option value="each">each</option><option value="g">grams (g)</option><option value="ml">milliliters (ml)</option></select></label>
            <label className="field">Storage<select value={defaultLocation} onChange={(event) => setDefaultLocation(event.target.value as PantryItem["location"])}>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
            <label className="field">Pantry tag<select value={defaultTag} onChange={(event) => setDefaultTag(event.target.value as PantryTag)}><option value="staple">Staple</option><option value="seasonal">Seasonal</option><option value="special">Special</option></select></label>
          </div>
          <button className="button secondary" onClick={() => prepareImport("list")}>Review list</button>
          <h3 className="receipt-title">Paste receipt text</h3>
          <p className="muted">Paste or type receipt lines. Totals and common payment lines are filtered; check the preview.</p>
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
        {reviewRows.map((row, index) => <div className="import-review-row" key={`${row.name}-${index}`}>
          <label className="field">Item name<input value={row.name} maxLength={80} onChange={(event) => setReviewRows((rows) => rows.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label>
          <label className="field">Amount<input type="number" min="0.01" max="100000" step="any" value={row.quantity} onChange={(event) => setReviewRows((rows) => rows.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} /></label>
          <label className="field">Unit<select value={row.unit} onChange={(event) => setReviewRows((rows) => rows.map((item, i) => i === index ? { ...item, unit: event.target.value as PantryItem["unit"] } : item))}><option value="each">each</option><option value="g">g</option><option value="ml">ml</option></select></label>
          <label className="field">Storage<select value={row.location} onChange={(event) => setReviewRows((rows) => rows.map((item, i) => i === index ? { ...item, location: event.target.value as PantryItem["location"] } : item))}>{locations.map((location) => <option key={location}>{location}</option>)}</select></label>
          <label className="field">Tag<select value={row.tag} onChange={(event) => setReviewRows((rows) => rows.map((item, i) => i === index ? { ...item, tag: event.target.value as PantryTag } : item))}><option value="staple">Staple</option><option value="seasonal">Seasonal</option><option value="special">Special</option></select></label>
          {state.pantry.some((item) => item.name.trim().toLowerCase() === row.name.trim().toLowerCase() && item.unit === row.unit) ? <label className="checkbox-label"><input type="checkbox" checked={row.merge} onChange={(event) => setReviewRows((rows) => rows.map((item, i) => i === index ? { ...item, merge: event.target.checked } : item))} /> Add to existing amount</label> : null}
          <button className="text-button" onClick={() => setReviewRows((rows) => rows.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        <div className="actions"><button className="button secondary" onClick={() => setReviewRows([])}>Cancel</button><button className="button" disabled={!reviewRows.length} onClick={saveImport}>Save reviewed items</button></div>
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
          <form key={editing ? `${editing.id}:${editing.unit}:${editingIndex}` : "new"} onSubmit={saveItem}>
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
                Amount
                <input
                  name="quantity"
                  type="number"
                  min="0"
                  max="100000"
                  step="any"
                  defaultValue={editing?.quantity ?? 1}
                  required
                />
              </label>
              <label className="field">
                Unit
                <select name="unit" defaultValue={editing?.unit ?? "each"}>
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
            <div className="form-footer">
              <label className="checkbox-label">
                <input
                  name="useSoon"
                  type="checkbox"
                  defaultChecked={editing?.useSoon ?? false}
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
                <button type="submit" className="button">
                  {editing ? "Save changes" : "Add to pantry"}
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
      {state.pantry.length >= 200 ? (
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
              const count = state.pantry.filter(
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
                {shown.map((item) => (
                  <tr key={`${item.id}:${item.unit}:${state.pantry.indexOf(item)}`}>
                    <td>
                      <span
                        className={`ingredient-dot ${item.useSoon && item.quantity > 0 ? "soon" : ""}`}
                        aria-hidden="true"
                      />
                      <strong>{item.name}</strong>
                    </td>
                    <td className="quantity">
                      {amount(item.quantity, item.unit)}
                    </td>
                    <td>
                      <span className="category-label">
                        {pantryCategoryLabel(inferPantryCategory(item))}
                      </span>
                    </td>
                    <td>
                      <span className="location-label">{item.location}</span>
                    </td>
                    <td><span className={`pantry-tag tag-${item.tag}`}>{item.tag}</span></td>
                    <td>
                      {item.quantity === 0 ? (
                        <span className="muted small">Out of stock</span>
                      ) : item.useSoon ? (
                        <span className="pill warm">Use soon</span>
                      ) : (
                        <span className="muted small">Ready when you are</span>
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
                ))}
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
