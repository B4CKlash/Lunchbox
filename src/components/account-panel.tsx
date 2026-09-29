"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { getAccountClient } from "@/features/accounts/client";
import { loadAccountKitchen, saveAccountKitchen } from "@/features/accounts/kitchen";
import { useHousehold } from "@/components/household-provider";

export function AccountPanel() {
  const [client] = useState(getAccountClient);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const userId = useRef<string | null>(null);
  const { state, replaceHousehold, reset } = useHousehold();

  useEffect(() => {
    if (!client) return;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      userId.current = session?.user.id ?? null;
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
        : "You are signed in. Choose whether to save this browser’s kitchen or load your account’s kitchen.");
    });
  }

  if (!client) return <section className="card account-card">
    <h1>Your account</h1><p>Account sign-in is not available yet. You can keep using your kitchen in this browser.</p>
  </section>;
  if (loading) return <p role="status">Checking your account…</p>;

  return <>
    <header className="page-heading"><div><p className="eyebrow">YOUR KITCHEN, WHEREVER YOU ARE</p><h1>Your account</h1>
      <p>Save your kitchen and bring it to another device.</p></div></header>
    <section className="card account-card">
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
        <h2>Your saved kitchen</h2>
        <p>Changes stay in this browser until you save them to your account. Saving replaces your previous account snapshot; loading replaces this browser’s kitchen.</p>
        <div className="actions account-actions">
          <button className="button" disabled={busy} onClick={() => {
            if (!window.confirm("Replace your account’s saved kitchen with this browser’s pantry, meals, and conversation?")) return;
            void run(async () => { await saveAccountKitchen(client, state); setMessage("Your kitchen was saved to your account."); });
          }}>Save kitchen to account</button>
          <button className="button secondary" disabled={busy} onClick={() => {
            if (!window.confirm("Replace this browser’s kitchen with your account’s saved kitchen? Unsaved changes will be lost.")) return;
            const requestedUser = user.id;
            void run(async () => {
              const saved = await loadAccountKitchen(client);
              if (userId.current !== requestedUser) return;
              if (!saved) { setMessage("No kitchen saved yet. Save this browser’s kitchen first."); return; }
              replaceHousehold(saved); setMessage("Your account’s kitchen was loaded into this browser.");
            });
          }}>Load saved kitchen</button>
        </div>
        <p>Signing out resets this browser to the sample kitchen. Save any changes you want to keep first.</p>
        <button className="button secondary" disabled={busy} onClick={() => {
          if (!window.confirm("Sign out and reset this browser’s kitchen? Save any changes to your account first.")) return;
          void run(async () => {
            const result = await client.auth.signOut({ scope: "local" });
            if (result.error) throw new Error(result.error.message);
            reset(); setMessage("You are signed out. This browser now shows the sample kitchen.");
          });
        }}>Sign out</button>
      </> : <>
        <h2>{mode === "signin" ? "Welcome back" : "Make yourself at home"}</h2>
        <p>Your current browser kitchen will stay as it is when you sign in.</p>
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
  </>;
}
