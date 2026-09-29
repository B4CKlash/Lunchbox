"use client";

import Link from "next/link";
import { ArrowRight, Check, ShoppingBasket, Utensils } from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import { buildShoppingList } from "@/features/planning/shopping";

const amount = (quantity: number, unit: string) =>
  `${quantity.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${unit}`;

export function ShoppingPanel() {
  const { state, setWorkspaceMode } = useHousehold();
  const shopping = buildShoppingList(state.pantry, state.meals);
  const servings = state.meals.reduce(
    (total, meal) => total + meal.servings,
    0,
  );

  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">JUST THE MISSING PIECES</p>
          <h1>A little list. A good week.</h1>
          <p>Your meals, minus what’s already in the kitchen.</p>
        </div>
        <Link
          className="button secondary"
          href="/meals"
          onClick={() => setWorkspaceMode("plan")}
        >
          Edit your plan <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>

      {!state.meals.length ? (
        <section className="card empty-state spacious">
          <span className="empty-symbol">
            <ShoppingBasket size={30} aria-hidden="true" />
          </span>
          <h2>Good lists start with a plan.</h2>
          <p>
            Choose a meal and we’ll combine the ingredients you’re missing into
            one simple shopping list.
          </p>
          <Link className="button" href="/meals">
            Find your first meal <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
      ) : (
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
              Matching ingredients are combined across your plan.
            </p>
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
                        {amount(item.required, item.unit)} needed ·{" "}
                        {amount(item.available, item.unit)} on hand
                      </p>
                    </div>
                    <strong className="shopping-amount">
                      {amount(item.quantity, item.unit)}
                    </strong>
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
              This list updates whenever your pantry, meals, or servings change.
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
                  <strong>{state.meals.length}</strong>
                  <span>
                    {state.meals.length === 1
                      ? "planned meal"
                      : "planned meals"}
                  </span>
                </div>
                <div>
                  <strong>{servings}</strong>
                  <span>total servings</span>
                </div>
              </div>
              <div className="summary-meals">
                {state.meals.map((meal) => (
                  <div key={meal.id}>
                    <Utensils size={15} aria-hidden="true" />
                    <span>
                      {meal.recipe.name}
                      <small>{meal.servings} servings</small>
                    </span>
                  </div>
                ))}
              </div>
              <Link
                className="text-link"
                href="/meals"
                onClick={() => setWorkspaceMode("plan")}
              >
                Back to the plan <ArrowRight size={15} aria-hidden="true" />
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
      )}
    </>
  );
}
