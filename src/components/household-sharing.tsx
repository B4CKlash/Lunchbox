"use client";

import { useState, type FormEvent } from "react";
import { useHousehold } from "./household-provider";
import { inviteToHousehold } from "@/features/pantry/remote";

export function HouseholdSharing() {
  const { householdId, createSharedHousehold, joinHousehold, syncStatus, state } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [invitation, setInvitation] = useState("");
  const [error, setError] = useState("");
  async function run(event: FormEvent<HTMLFormElement>, action: (form: FormData) => Promise<void>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try { await action(form); } catch (caught) { setError(caught instanceof Error ? caught.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="card" style={{ padding: "1.5rem", marginTop: "1.5rem" }} aria-labelledby="household-sharing-title">
    <h2 id="household-sharing-title">Your shared kitchen</h2><p>{syncStatus}</p>
    {householdId ? <>
      <p>Your pantry, planning session and shopping list are shared with household members.</p>
      <form onSubmit={(event) => void run(event, async (form) => {
        const result = await inviteToHousehold(householdId, String(form.get("email")));
        setInvitation(result.token); setMessage(`Invitation expires ${new Date(result.expiresAt).toLocaleString()}. Share this code with your partner.`);
      })}>
        <label className="field">Partner’s account email<input name="email" type="email" required /></label>
        <button className="button secondary" disabled={busy}>Create partner invitation</button>
      </form>
      {invitation && <label className="field">Invitation code<input readOnly value={invitation} onFocus={(event) => event.currentTarget.select()} /></label>}
    </> : <>
      <p>Start with this browser’s kitchen, or join your partner. A recovery copy is saved before either change.</p>
      <form onSubmit={(event) => void run(event, async (form) => {
        const result = await createSharedHousehold(String(form.get("name")));
        if (!result.ok) throw new Error(result.error); setMessage("Your shared household is ready.");
      })}>
        <label className="field">Household name<input name="name" defaultValue="Our kitchen" maxLength={120} required /></label>
        <button className="button" disabled={busy}>Share this kitchen</button>
      </form>
      <form onSubmit={(event) => void run(event, async (form) => {
        const result = await joinHousehold(String(form.get("token")).trim());
        if (!result.ok) throw new Error(result.error); setMessage("You joined the shared household.");
      })}>
        <label className="field">Partner invitation code<input name="token" required /></label>
        <button className="button secondary" disabled={busy}>Join household</button>
      </form>
    </>}
    <button className="text-button" onClick={() => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "lunchbox-household-backup.json"; link.click(); URL.revokeObjectURL(url);
    }}>Download kitchen backup</button>
    {error && <p className="error-message" role="alert">{error}</p>}
    <p role="status">{message}</p>
  </section>;
}
