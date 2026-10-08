"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  CookingPot,
  Leaf,
  PackageOpen,
  ShoppingBasket,
  SlidersHorizontal,
  Utensils,
  UserRound,
} from "lucide-react";
import { useHousehold } from "@/components/household-provider";

const navigation = [
  {
    href: "/onboarding",
    label: "Your preferences",
    step: "00",
    icon: SlidersHorizontal,
  },
  { href: "/pantry", label: "Your pantry", step: "01", icon: PackageOpen },
  { href: "/meals", label: "Meals & plan", step: "02", icon: Utensils },
  {
    href: "/shopping",
    label: "Shopping list",
    step: "03",
    icon: ShoppingBasket,
  },
  { href: "/account", label: "Your account", step: "", icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, storageError, updateError, reset, householdId, syncStatus, pendingChange, retryPending, discardPending } = useHousehold();
  const active = navigation.find((item) => item.href === pathname);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Kitchen navigation">
        <Link className="brand" href="/pantry" aria-label="LunchBox home">
          <span className="brand-mark">
            <CookingPot size={27} />
          </span>
          LunchBox<span className="brand-dot">.</span>
        </Link>
        <p className="brand-caption">YOUR KITCHEN, CONNECTED.</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ href, label, step, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link${pathname === href ? " active" : ""}`}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              <span className="nav-number">{step}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <Leaf size={23} />
          <h2>
            A little less waste.
            <br />A lot more possibility.
          </h2>
          <p>Start with what you have. Make something good.</p>
        </div>
        <div className="sidebar-footer">
          <span>{syncStatus}</span>
          <button
            className="reset-button"
            onClick={() => {
              if (
                window.confirm(
                  "Reset this browser’s pantry, meal plan, recipe box, and conversation to the sample kitchen?",
                )
              )
                reset();
            }}
            disabled={!ready || Boolean(householdId)}
          >
            Reset sample kitchen <ArrowUpRight size={13} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-trail">
            My kitchen <span>/</span>{" "}
            <strong>{active?.label ?? "LunchBox"}</strong>
          </div>
          <div className="household-badge">
            <span className="status-dot" />
            {householdId ? "Shared household" : "Browser kitchen"}<span className="avatar">LB</span>
          </div>
        </header>
        <main id="main-content" className="page-content">
          <div className="demo-banner">
            <span className="status-dot" />Household pilot{" "}
            <span>{syncStatus}</span>
          </div>
          {storageError && (
            <p className="storage-warning" role="alert">
              {storageError}
            </p>
          )}
          {updateError && (
            <p className="storage-warning" role="alert">
              {updateError}
            </p>
          )}
          {pendingChange && <div className="storage-warning" role="status">
            A household change is waiting to be saved. Retry safely saves the same change once.
            <div className="actions"><button className="button secondary" onClick={() => void retryPending()}>Retry saving</button>
            <button className="text-button" onClick={discardPending}>Discard unsaved change</button></div>
          </div>}
          {ready ? (
            children
          ) : (
            <div className="loading-state" role="status">
              Opening your kitchen…
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
