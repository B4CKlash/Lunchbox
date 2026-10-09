"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { getAccountClient } from "@/features/accounts/client";
import { accountActionError, accountCallbackError, accountCallbackPath, accountInvitation, invitationCannotBeRetried, needsPasswordSetup, passwordSetupError, unusableAccountLinkMessage, type AccountInvitation } from "@/features/accounts/onboarding";
import styles from "./account-panel.module.css";
import { HouseholdSharing } from "./household-sharing";

export function AccountPanel({ inviteOnly = false }: { inviteOnly?: boolean }) {
  const [client] = useState(getAccountClient);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invitation, setInvitation] = useState<AccountInvitation>(() => typeof window === "undefined" ? { status: "absent" } : accountInvitation(window.location.hash));
  const [callbackError, setCallbackError] = useState(() => typeof window === "undefined" ? null : accountCallbackError(window.location.search, window.location.hash) ?? (accountInvitation(window.location.hash).status === "invalid" ? unusableAccountLinkMessage : null));
  const [providerCallbackExpected] = useState(() => typeof window !== "undefined" && (new URLSearchParams(window.location.hash.slice(1)).has("access_token") || new URLSearchParams(window.location.search).has("code")));
  const busyRef = useRef(false);
  const invitationGeneration = useRef(0);
  const setupRequired = needsPasswordSetup(user, callbackError);
  const signingUp = mode === "signup" && !inviteOnly;

  useEffect(() => {
    if (!client) return;
    // Keep an unredeemed invitation only in component memory. Preserving the
    // query also preserves any legitimate Vercel preview-access parameters.
    const cleanCallbackUrl = () => {
      const cleanedPath = accountCallbackPath(window.location.pathname, window.location.search, window.location.hash);
      if (cleanedPath !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
        window.history.replaceState(window.history.state, "", cleanedPath);
    };
    cleanCallbackUrl();
    let active = true;
    const captureInvitationChange = () => {
      const next = accountInvitation(window.location.hash);
      const nextError = accountCallbackError(window.location.search, window.location.hash);
      if (next.status !== "absent" || nextError) {
        invitationGeneration.current += 1;
        setInvitation(next);
        setCallbackError(nextError ?? (next.status === "invalid" ? unusableAccountLinkMessage : null));
        setError(""); setMessage("");
      }
      cleanCallbackUrl();
    };
    window.addEventListener("hashchange", captureInvitationChange);
    const deadline = window.setTimeout(() => {
      if (active) { setLoading(false); setError(accountActionError(null, "session")); }
    }, 15_000);
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      window.clearTimeout(deadline);
      setUser(session?.user ?? null);
      setLoading(false);
    });
    void client.auth.initialize().then(({ error: initializationError }) => {
      // The singleton retains its initialization result across route changes.
      // Only a callback on this mount can explain an invitation error here.
      if (active && initializationError && providerCallbackExpected && invitationGeneration.current === 0) { setCallbackError(unusableAccountLinkMessage); setLoading(false); window.clearTimeout(deadline); }
    }).catch(() => {
      if (active) { setError(accountActionError(null, "session")); setLoading(false); window.clearTimeout(deadline); }
    });
    return () => { active = false; window.clearTimeout(deadline); window.removeEventListener("hashchange", captureInvitationChange); subscription.unsubscribe(); };
  }, [client, providerCallbackExpected]);

  async function run(kind: Parameters<typeof accountActionError>[1], action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (caught) { setError(accountActionError(caught, kind, inviteOnly)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function acceptInvitation() {
    if (!client || invitation.status !== "pending") return;
    const generation = invitationGeneration.current;
    void run("invite", async () => {
      const result = await client.auth.verifyOtp({ token_hash: invitation.tokenHash, type: "invite" });
      // Opening another personal link while a request is in flight must not
      // dismiss the new invitation or present the previous account as its user.
      if (generation !== invitationGeneration.current) return;
      if (result.error) {
        if (invitationCannotBeRetried(result.error)) { setInvitation({ status: "absent" }); setCallbackError(unusableAccountLinkMessage); return; }
        throw result.error;
      }
      setInvitation({ status: "absent" });
      if (!result.data.session || !result.data.user) { setCallbackError(unusableAccountLinkMessage); return; }
      setUser(result.data.user);
      setCallbackError(null);
      setMessage("Your personal invitation was accepted.");
    });
  }

  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const name = String(form.get("name") ?? "").trim();
    void run(signingUp ? "signup" : "signin", async () => {
      if (!client) return;
      const result = signingUp
        ? await client.auth.signUp({ email, password, options: {
            data: { display_name: name }, emailRedirectTo: `${window.location.origin}/account`,
          } })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setCallbackError(null);
      setMessage(signingUp && !result.data.session
        ? "Check your email to confirm your account, then sign in."
        : "You are signed in.");
    });
  }

  function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const password = String(form.get("password"));
    const validationError = passwordSetupError(password, String(form.get("confirmation")));
    if (validationError) { setError(validationError); setMessage(""); return; }
    if (!client || !user || callbackError) return;
    void run("password", async () => {
      const current = await client.auth.getUser();
      if (current.error) throw current.error;
      if (current.data.user.id !== user.id) { setError("The signed-in account changed. Refresh before setting a password."); return; }
      const result = await client.auth.updateUser({ password, ...(setupRequired ? { data: { needs_password_setup: false } } : {}) });
      if (result.error) throw result.error;
      element.reset();
      setUser(result.data.user);
      setMessage(setupRequired ? "Your password is saved. Your shared kitchen is available below, and Meals & plan opens your planner." : "Your password was updated.");
    });
  }

  const passwordForm = <form key={user?.id} onSubmit={savePassword}>
    <label className="field">New password<input name="password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} aria-describedby="password-help" /></label>
    <p id="password-help">Use at least 8 characters. You’ll use this password when you return.</p>
    <label className="field">Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={8} required disabled={busy} /></label>
    <button className="button" disabled={busy}>{busy ? "Saving…" : setupRequired ? "Set password" : "Update password"}</button>
  </form>;

  if (!client) return <section className={`card ${styles.card}`}>
    <h1>Your account</h1><p>Account sign-in is not available yet. You can keep using your kitchen in this browser.</p>
  </section>;
  if (loading) return <p role="status">Checking your account…</p>;

  return <>
    <header className="page-heading"><div><p className="eyebrow">YOUR KITCHEN, WHEREVER YOU ARE</p><h1>Your account</h1>
      <p>{setupRequired ? "Finish setting up your personal invitation." : "Sign in and manage your profile."}</p></div></header>
    <section className={`card ${styles.card}`}>
      {callbackError && <p className="error-message" role="alert">{callbackError}</p>}
      {invitation.status === "pending" ? <>
        <h2>You’re invited to LunchBox</h2>
        <p>Accept the personal invitation shared with you. You’ll choose your password next.</p>
        <p>If you refresh before accepting, reopen your personal invitation link.</p>
        {user && <p>You are currently signed in as {user.email}. Accepting this invitation opens the invited account.</p>}
        <button className="button" disabled={busy} onClick={acceptInvitation}>{busy ? "Accepting invitation…" : "Accept invitation"}</button>
      </> : user ? <>
        <h2>{setupRequired ? `Welcome${user.user_metadata.display_name ? `, ${user.user_metadata.display_name}` : ""}` : user.user_metadata.display_name || "Welcome back"}</h2><p>{user.email}</p>
        {callbackError ? <p>You are still signed in to the account shown above. Sign out to use a different account or open a new invitation.</p> : setupRequired ? <>
          <p>Your invitation has been accepted. Choose your password to finish setting up this account.</p>
          {passwordForm}
        </> : <>
        <form onSubmit={(event) => {
          event.preventDefault();
          const name = String(new FormData(event.currentTarget).get("name")).trim();
          void run("profile", async () => {
            const result = await client.auth.updateUser({ data: { display_name: name } });
            if (result.error) throw result.error;
            setMessage("Your profile was updated.");
          });
        }}>
          <label className="field">Your name<input name="name" defaultValue={user.user_metadata.display_name || ""} maxLength={80} required disabled={busy} /></label>
          <button className="button secondary" disabled={busy}>Save profile</button>
        </form>
        <details><summary>Change password</summary>{passwordForm}</details>
        </>}
        <button className="button secondary" disabled={busy} onClick={() => {
          void run("signout", async () => {
            const result = await client.auth.signOut({ scope: "local" });
            if (result.error) throw result.error;
            setMessage("You are signed out.");
          });
        }}>Sign out</button>
      </> : <>
        <h2>{signingUp ? "Make yourself at home" : "Welcome back"}</h2>
        <p>Sign in to open your shared household. Your browser kitchen is kept in a recovery copy before switching.</p>
        {inviteOnly && <p>Joining the pilot? Open the personal invitation link shared with you and choose a password. If the link no longer works, ask the pilot organizer for help.</p>}
        <form key={mode} onSubmit={authenticate}>
          {signingUp && <label className="field">Your name<input name="name" autoComplete="name" maxLength={80} required /></label>}
          <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
          <label className="field">Password<input name="password" type="password" autoComplete={signingUp ? "new-password" : "current-password"} minLength={signingUp ? 8 : 1} required /></label>
          <button className="button" disabled={busy}>{busy ? "Please wait…" : signingUp ? "Create account" : "Sign in"}</button>
        </form>
        {!inviteOnly && <button className="text-button" disabled={busy} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setMessage(""); }}>
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>}
      </>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <p className="status-message" role="status">{message}</p>
    </section>
    {user && invitation.status !== "pending" && !setupRequired && !callbackError && <HouseholdSharing />}
  </>;
}
