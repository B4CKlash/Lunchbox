"use client";

import Link from "next/link";
import { ArrowRight, Check, Copy, Download, ExternalLink, ShoppingBasket, Utensils } from "lucide-react";
import { useState } from "react";
import { useHousehold } from "@/components/household-provider";
import { addDays, localDate } from "@/features/planning/calendar";
import { buildShoppingList } from "@/features/planning/shopping";

const amount = (quantity: number, unit: string) =>
  `${quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${unit}`;
const calendarDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
type Retailer = "qfc" | "safeway" | "whole-foods";
const retailerNames: Record<Retailer, string> = {
  qfc: "QFC",
  safeway: "Safeway",
  "whole-foods": "Whole Foods",
};
function retailerSearchUrl(retailer: Retailer, itemName: string) {
  const query = encodeURIComponent(itemName);
  if (retailer === "qfc") return `https://www.qfc.com/search?query=${query}`;
  if (retailer === "safeway") return `https://www.safeway.com/shop/search-results.html?q=${query}`;
  return `https://www.amazon.com/s?k=${query}&i=wholefoods`;
}

export function ShoppingPanel() {
  const { state, setWorkspaceMode } = useHousehold();
  const [scope, setScope] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [retailer, setRetailer] = useState<Retailer>("qfc");
  const [handoffMessage, setHandoffMessage] = useState("");
  const [integrationError, setIntegrationError] = useState("");
  const [orderUrl, setOrderUrl] = useState("");
  const [demoUsername, setDemoUsername] = useState("");
  const [demoPassword, setDemoPassword] = useState("");
  const [demoLoginMessage, setDemoLoginMessage] = useState("");
  const today = localDate(new Date());
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);
  const weekEnd = addDays(today, 6);
  const datedMeals = state.meals.filter((meal) => meal.date);
  const selectedMeals = state.meals.filter((meal) => {
    if (scope === "selected") return selected.includes(meal.id);
    if (scope === "tomorrow") return meal.date === tomorrow;
    if (scope === "two-days") return meal.date === tomorrow || meal.date === dayAfter;
    if (scope === "week") return Boolean(meal.date && meal.date >= today && meal.date <= weekEnd);
    return true;
  });
  const shopping = buildShoppingList(state.pantry, selectedMeals);
  const servings = selectedMeals.reduce(
    (total, meal) => total + meal.servings,
    0,
  );
  const storeHandoff = (
    <>
      <section className="store-handoff card" aria-labelledby="store-handoff-heading">
        <div>
          <p className="eyebrow">READY FOR THE STORE</p>
          <h3 id="store-handoff-heading">Take this list with you</h3>
          <p className="muted small">Search items at a retailer or copy the list. These links open store search pages; they don’t add products to a cart.</p>
        </div>
        <label className="field">Choose a store
          <select value={retailer} onChange={(event) => setRetailer(event.target.value as Retailer)}>
            <option value="qfc">QFC</option>
            <option value="safeway">Safeway</option>
            <option value="whole-foods">Whole Foods</option>
          </select>
        </label>
        <div className="actions">
          <button className="button secondary" disabled={!shopping.length} onClick={async () => {
            const text = shopping.map((item) => `${item.name} — ${amount(item.quantity, item.unit)}`).join("\n");
            try { await navigator.clipboard.writeText(text); setHandoffMessage("Shopping list copied."); }
            catch { setIntegrationError("Clipboard access is unavailable in this browser."); }
          }}><Copy size={15} aria-hidden="true" /> Copy list</button>
          <button className="button secondary" disabled={!shopping.length} onClick={() => {
            const rows = [["Item", "Quantity", "Unit"], ...shopping.map((item) => [item.name, String(item.quantity), item.unit])];
            const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
            const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
            const anchor = document.createElement("a"); anchor.href = url; anchor.download = "lunchbox-shopping-list.csv"; anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}><Download size={15} aria-hidden="true" /> Download CSV</button>
        </div>
        {handoffMessage ? <p className="muted small" role="status">{handoffMessage}</p> : null}
        <form className="demo-login" onSubmit={(event) => {
          event.preventDefault();
          setDemoUsername(""); setDemoPassword("");
          setDemoLoginMessage("Demo preview only. No store sign-in was attempted and nothing was sent or saved.");
        }}>
          <p className="eyebrow">FUTURE GROCERY APP CONNECTION</p>
          <h4>Sign-in screen preview</h4>
          <p className="demo-login-notice">Visual mockup only. Don’t enter real store credentials. These fields stay in this page and are cleared on submit.</p>
          <div className="demo-login-fields">
            <label className="field">Username<input value={demoUsername} onChange={(event) => setDemoUsername(event.target.value)} autoComplete="off" placeholder="Demo username" /></label>
            <label className="field">Password<input type="password" value={demoPassword} onChange={(event) => setDemoPassword(event.target.value)} autoComplete="new-password" placeholder="Demo password" /></label>
          </div>
          <button className="button secondary" type="submit">Preview connection</button>
          {demoLoginMessage ? <p className="muted small" role="status">{demoLoginMessage}</p> : null}
        </form>
      </section>
      <div className="shopping-export">
        <button className="button" disabled={!shopping.length} onClick={async () => {
          setIntegrationError(""); setOrderUrl("");
          try {
            const response = await fetch("/api/shopping/instacart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: shopping }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "Could not create your Instacart list.");
            setOrderUrl(data.url);
          } catch (error) { setIntegrationError(error instanceof Error ? error.message : "Could not create your Instacart list."); }
        }}>Create Instacart list</button>
        {orderUrl ? <a className="button secondary" href={orderUrl} target="_blank" rel="noreferrer">Open grocery list <ArrowRight size={16} aria-hidden="true" /></a> : null}
        {integrationError ? <p className="error-message" role="alert">{integrationError}</p> : null}
        <p className="muted small">Instacart list linking needs an approved developer API key. QFC links open catalog search; use its developer API for a future cart connection. Safeway and Whole Foods handoff opens retailer search.</p>
      </div>
    </>
  );

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">JUST THE MISSING PIECES</p>
          <h1>A little list. A good week.</h1>
          <p>Your committed meals, minus what’s already in the kitchen.</p>
        </div>
        <Link
          className="button secondary"
          href="/meals"
          onClick={() => setWorkspaceMode("plan")}
        >
          Open calendar <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>

      {state.workspace.calendar.draft !== null ? (
        <p className="status-message" role="status">
          You have a calendar draft. This list includes only committed meals.{" "}
          <Link
            className="text-link"
            href="/meals"
            onClick={() => setWorkspaceMode("plan")}
          >
            Review and commit your calendar
          </Link>
        </p>
      ) : null}

      {!state.meals.length && !shopping.length ? (
        <>
        <section className="card empty-state spacious">
          <span className="empty-symbol">
            <ShoppingBasket size={30} aria-hidden="true" />
          </span>
          <h2>Good lists start with a plan.</h2>
          <p>
            Add meals to your calendar, then commit your plan. We’ll combine the
            ingredients you’re missing into one simple shopping list.
          </p>
          <Link
            className="button"
            href="/meals"
            onClick={() => setWorkspaceMode("plan")}
          >
            Plan your meals <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
        {storeHandoff}
        </>
      ) : (
        <>
        <div className="shopping-layout">
          <section
            className="card shopping-card"
            aria-labelledby="shopping-heading"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">TO PICK UP</p>
                <h2 id="shopping-heading">
                  Your shopping list{" "}
                  <span className="count-badge">{shopping.length}</span>
                </h2>
              </div>
              <ShoppingBasket size={24} aria-hidden="true" />
            </div>
            <p className="muted shopping-intro">
              {selectedMeals.length
                ? `Ingredients combined across ${selectedMeals.length === 1 ? "the selected meal" : `${selectedMeals.length} selected meals`}.`
                : "Pantry staples below their restock levels."}
              {state.meals.length
                ? "Matching ingredients are combined across your committed meals, including staple restock reminders."
                : "Staples below your restock level."}
            </p>
            <div className="shopping-filters">
              <label className="field">Build list from
                <select value={scope} onChange={(event) => { setScope(event.target.value); setOrderUrl(""); }}>
                  <option value="all">All committed meals</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="two-days">Next 2 days</option>
                  <option value="week">This week (next 7 days)</option>
                  <option value="selected">Choose meals</option>
                </select>
              </label>
              {scope === "selected" ? <fieldset className="shopping-recipe-picker"><legend>Select committed meals</legend>{state.meals.map((meal) => <label key={meal.id}><input type="checkbox" checked={selected.includes(meal.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, meal.id] : current.filter((id) => id !== meal.id))} /> {meal.recipe.name} <span>{meal.date ? calendarDate(meal.date) : "No date"}</span></label>)}</fieldset> : null}
              {scope !== "selected" && scope !== "all" && !datedMeals.length ? <p className="muted small">Schedule meals in the calendar to use timeframe filters.</p> : null}
            </div>
            {shopping.length ? (
              <ul className="shopping-list">
                {shopping.map((item, index) => (
                  <li
                    className="shopping-row"
                    key={`${item.ingredientId}-${item.unit}`}
                  >
                    <span className="shopping-index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{item.name}</h3>
                      <p>
                        {item.restock && item.quantity === 0
                          ? "Out of stock · Pantry staple"
                          : `${amount(item.required, item.unit)} needed · ${amount(item.available, item.unit)} on hand`}
                      </p>
                    </div>
                    <strong className="shopping-amount">
                      {item.restock && item.quantity === 0 ? "Restock" : amount(item.quantity, item.unit)}
                    </strong>
                    <a className="shopping-item-search" href={retailerSearchUrl(retailer, item.name)} target="_blank" rel="noreferrer" aria-label={`Search ${item.name} at ${retailerNames[retailer]}`}>
                      Search store <ExternalLink size={13} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <span className="empty-symbol">
                  <Check size={25} aria-hidden="true" />
                </span>
                <h3>You’re all set.</h3>
                <p>Your pantry has everything you need for these meals.</p>
              </div>
            )}
            <p className="footnote">
              This list updates when you commit your calendar or change your
              pantry. Draft edits stay in the calendar until you commit them.
            </p>
          </section>

          <aside className="shopping-aside" aria-label="Plan summary">
            <section className="plan-summary">
              <span className="eyebrow">A PLAN THAT ADDS UP</span>
              <h2>
                Buy what you need.
                <br />
                Use what you have.
              </h2>
              <div className="summary-metrics">
                <div>
                  <strong>{selectedMeals.length}</strong>
                  <span>
                    {selectedMeals.length === 1 ? "selected meal" : "selected meals"}
                  </span>
                </div>
                <div>
                  <strong>{servings}</strong>
                  <span>total servings</span>
                </div>
              </div>
              <div className="summary-meals">
                {selectedMeals.map((meal) => (
                  <div key={meal.id}>
                    <Utensils size={15} aria-hidden="true" />
                    <span>
                      {meal.recipe.name}
                      <small>
                        {meal.date ? `${calendarDate(meal.date)} · ` : ""}
                        {meal.slot
                          ? `${meal.slot.charAt(0).toUpperCase()}${meal.slot.slice(1)} · `
                          : ""}
                        {meal.servings} servings
                      </small>
                    </span>
                  </div>
                ))}
              </div>
              <Link
                className="text-link"
                href="/meals"
                onClick={() => setWorkspaceMode("plan")}
              >
                Back to the calendar <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </section>
            <section className="card pantry-reminder">
              <h3>Already have something?</h3>
              <p>
                Update the amount in your pantry and we’ll adjust this list for
                you.
              </p>
              <Link href="/pantry" className="text-link">
                Check your pantry <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </section>
          </aside>
        </div>
        {storeHandoff}
        </>
      )}
    </>
  );
}
