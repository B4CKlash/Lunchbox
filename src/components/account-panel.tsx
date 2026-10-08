"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { getAccountClient } from "@/features/accounts/client";
import styles from "./account-panel.module.css";
import { HouseholdSharing } from "./household-sharing";

export function AccountPanel() {
  const [client] = useState(getAccountClient);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [client]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); }
    finally { setBusy(false); }
  }

  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const name = String(form.get("name") ?? "").trim();
    void run(async () => {
      if (!client) return;
      const result = mode === "signup"
        ? await client.auth.signUp({ email, password, options: {
            data: { display_name: name }, emailRedirectTo: `${window.location.origin}/account`,
          } })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw new Error(result.error.message);
      setMessage(mode === "signup" && !result.data.session
        ? "Check your email to confirm your account, then sign in."
        : "You are signed in.");
    });
  }

  if (!client) return <section className={`card ${styles.card}`}>
    <h1>Your account</h1><p>Account sign-in is not available yet. You can keep using your kitchen in this browser.</p>
  </section>;
  if (loading) return <p role="status">Checking your account…</p>;

  return <>
    <header className="page-heading"><div><p className="eyebrow">YOUR KITCHEN, WHEREVER YOU ARE</p><h1>Your account</h1>
      <p>Sign in and manage your profile.</p></div></header>
    <section className={`card ${styles.card}`}>
      {user ? <>
        <h2>{user.user_metadata.display_name || "Welcome back"}</h2><p>{user.email}</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          const name = String(new FormData(event.currentTarget).get("name")).trim();
          void run(async () => {
            const result = await client.auth.updateUser({ data: { display_name: name } });
            if (result.error) throw new Error(result.error.message);
            setMessage("Your profile was updated.");
          });
        }}>
          <label className="field">Your name<input name="name" defaultValue={user.user_metadata.display_name || ""} maxLength={80} required /></label>
          <button className="button secondary" disabled={busy}>Save profile</button>
        </form>
        <button className="button secondary" disabled={busy} onClick={() => {
          void run(async () => {
            const result = await client.auth.signOut({ scope: "local" });
            if (result.error) throw new Error(result.error.message);
            setMessage("You are signed out.");
          });
        }}>Sign out</button>
      </> : <>
        <h2>{mode === "signin" ? "Welcome back" : "Make yourself at home"}</h2>
        <p>Sign in to open your shared household. Your browser kitchen is kept in a recovery copy before switching.</p>
        <form key={mode} onSubmit={authenticate}>
          {mode === "signup" && <label className="field">Your name<input name="name" autoComplete="name" maxLength={80} required /></label>}
          <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
          <label className="field">Password<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : 1} required /></label>
          <button className="button" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <button className="text-button" disabled={busy} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <p className="status-message" role="status">{message}</p>
    </section>
    {user && <HouseholdSharing />}
  </>;
}
