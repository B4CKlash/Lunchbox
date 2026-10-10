"use client";

import { useState } from "react";
import { useHousehold } from "./household-provider";
import type { ProfileFact } from "@/lib/contracts";

function describe(fact: ProfileFact, names: Map<string, string>) {
  const value = fact.value;
  if (value.kind === "equipment") return `Kitchen: ${value.equipment.replaceAll("-", " ")} ${value.availability}`;
  const target = value.target.kind === "ingredient" ? value.target.name : value.target.kind === "category" ? value.target.category : value.target.text;
  const person = value.scope.kind === "household" ? "Household" : names.get(value.scope.memberId) ?? "Household member";
  return `${person}: ${value.disliked ? "dislikes" : "no longer dislikes"} ${target}`;
}

export function ProfileMemory() {
  const { state, householdId, currentMemberId, dispatchPilot } = useHousehold();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pilot = state.pilot;
  if (!pilot) return null;
  const actor = householdId ? currentMemberId : pilot.members[0].id;
  const names = new Map(pilot.members.map((person) => [person.id, person.name]));
  const receipt = [...pilot.receipts].reverse().find((entry) => ["upsert_profile_fact", "remove_profile_fact"].includes(entry.operationType) || (["receive_planning_result", "receive_recipe_chat_result"].includes(entry.operationType) && entry.summary.includes("preference change")));
  const remembered = receipt ? pilot.profileFacts.filter((fact) => fact.source.commandId === receipt.commandId).map((fact) => describe(fact, names)) : [];
  const forgotten = receipt?.inverse?.data.profileFacts.filter((fact) => !pilot.profileFacts.some((current) => current.id === fact.id)).map((fact) => describe(fact, names)) ?? [];
  async function run(operation: Parameters<typeof dispatchPilot>[0]) {
    if (saving) return;
    setSaving(true); setError(null);
    try { const result = await dispatchPilot(operation); if (!result.ok) setError(result.error ?? "That preference could not be saved. Please retry."); }
    catch { setError("That preference could not be saved. Please retry."); }
    finally { setSaving(false); }
  }
  return <section className="card" aria-label="Remembered kitchen preferences">
    {receipt ? <p className="status-message" role="status">
      {receipt.undoneBy ? "Preference change undone. Both conversations are kept." : remembered.length ? `Remembered: ${remembered.join("; ")}.` : forgotten.length ? `Forgot remembered preference: ${forgotten.join("; ")}.` : receipt.summary}
      {receipt.inverse && !receipt.undoneBy ? <> <button className="text-button" disabled={saving} onClick={() => void run({ type: "undo", receiptId: receipt.id })}>Undo preference change</button></> : null}
    </p> : null}
    <details>
      <summary>Remembered preferences and kitchen equipment ({pilot.profileFacts.length})</summary>
      <p className="muted">Explicit lasting preferences from either conversation guide future ideas. “No mushrooms tonight” applies to that request. Forget removes a fact; a correction records your current preference.</p>
      {pilot.profileFacts.length ? <ul>{pilot.profileFacts.map((fact) => {
        const value = fact.value;
        const canEdit = value.kind === "equipment" || value.scope.kind === "household" || value.scope.memberId === actor;
        return <li key={fact.id}>
          <span>{describe(fact, names)}</span>{canEdit ? <>
            {value.kind === "equipment" ? <select aria-label={`${value.equipment} availability`} value={value.availability} disabled={saving} onChange={(event) => void run({ type: "upsert_profile_fact", value: { ...value, availability: event.target.value as typeof value.availability }, sourceText: `Kitchen equipment correction: ${value.equipment} ${event.target.value}` })}><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="unknown">Unknown</option></select> : value.disliked ? <button className="text-button" disabled={saving} onClick={() => void run({ type: "upsert_profile_fact", value: { ...value, disliked: false }, sourceText: `Corrected saved dislike: ${describe(fact, names)}` })}>No longer dislike</button> : null}
            <button className="text-button" disabled={saving} onClick={() => void run({ type: "remove_profile_fact", factId: fact.id, sourceText: `Forget: ${describe(fact, names)}` })}>Forget</button>
          </> : null}
        </li>;
      })}</ul> : <p className="muted">No explicit preferences remembered yet. Try “I don’t like mushrooms” or “We don’t have an oven.”</p>}
    </details>
    {error ? <p className="error-message" role="alert">{error}</p> : null}
  </section>;
}
