"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Leaf, Package, Plus, X } from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import { pantryItemSchema, type PantryItem } from "@/lib/contracts";

const locations = ["Fridge", "Freezer", "Cupboard", "Garden"] as const;
const amount = (quantity: number, unit: string) =>
  `${quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${unit}`;

export function PantryPanel() {
  const { state, setPantry } = useHousehold();
  const [editor, setEditor] = useState<PantryItem | "new" | null>(null);
  const [filter, setFilter] = useState<"all" | "soon">("all");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const useSoon = state.pantry.filter(
    (item) => item.useSoon && item.quantity > 0,
  );
  const inStock = state.pantry.filter((item) => item.quantity > 0);
  const shown = filter === "soon" ? useSoon : state.pantry;
  const editing = editor && editor !== "new" ? editor : null;

  function openEditor(item: PantryItem | "new") {
    setError(null);
    setMessage("");
    setEditor(item);
  }

  function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    let id = editing?.id;
    if (!id) {
      const slug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) || "ingredient";
      id = slug;
      let suffix = 2;
      while (state.pantry.some((item) => item.id === id))
        id = `${slug}-${suffix++}`;
    }
    const result = pantryItemSchema.safeParse({
      id,
      name,
      quantity: Number(form.get("quantity")),
      unit: form.get("unit"),
      location: form.get("location"),
      useSoon: form.get("useSoon") === "on",
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
    setPantry(
      editing
        ? state.pantry.map((item) =>
            item.id === editing.id ? result.data : item,
          )
        : [...state.pantry, result.data],
    );
    setMessage(
      `${result.data.name} ${editing ? "updated" : "added to your pantry"}.`,
    );
    setEditor(null);
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
          <form key={editing?.id ?? "new"} onSubmit={saveItem}>
            <div className="ingredient-fields">
              <label className="field ingredient-name">
                Ingredient name
                <input
                  name="name"
                  placeholder="e.g. Cherry tomatoes"
                  defaultValue={editing?.name ?? ""}
                  maxLength={80}
                  required
                  autoFocus
                />
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
            </div>
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
          <div className="segmented-control" aria-label="Filter pantry">
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
          </div>
        </div>
        {shown.length ? (
          <div className="table-scroll">
            <table className="pantry-table">
              <thead>
                <tr>
                  <th scope="col">Ingredient</th>
                  <th scope="col">On hand</th>
                  <th scope="col">Storage</th>
                  <th scope="col">Keep in mind</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id}>
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
                      <span className="location-label">{item.location}</span>
                    </td>
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
                : "Make yourself at home."}
            </h3>
            <p>
              {filter === "soon"
                ? "Mark an ingredient “Use this soon” to find it here."
                : "Add your first ingredient to start filling your pantry."}
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
