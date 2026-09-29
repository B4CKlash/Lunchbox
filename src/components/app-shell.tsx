"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  CookingPot,
  Leaf,
  PackageOpen,
  ShoppingBasket,
  Utensils,
} from "lucide-react";
import { useHousehold } from "@/components/household-provider";

const navigation = [
  { href: "/pantry", label: "Your pantry", step: "01", icon: PackageOpen },
  { href: "/meals", label: "Meals & plan", step: "02", icon: Utensils },
  {
    href: "/shopping",
    label: "Shopping list",
    step: "03",
    icon: ShoppingBasket,
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, storageError, updateError, reset } = useHousehold();
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
          <span>Sample kitchen · saved here</span>
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
            disabled={!ready}
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
            Sample household<span className="avatar">LB</span>
          </div>
        </header>
        <main id="main-content" className="page-content">
          <div className="demo-banner">
            <span className="status-dot" />A little taste of LunchBox{" "}
            <span>Sample recipes · changes stay in this browser</span>
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
