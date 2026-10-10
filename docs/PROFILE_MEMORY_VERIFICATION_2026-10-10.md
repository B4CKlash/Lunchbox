# Explicit profile memory — 2026-10-10

Follow-up for [HP-06 / B4C-81](https://linear.app/b4cklash/issue/B4C-81/hp-06-resident-planning-assistant), [HP-08 / B4C-83](https://linear.app/b4cklash/issue/B4C-83/hp-08-feedback-and-personal-context), and [HP-09 / B4C-84](https://linear.app/b4cklash/issue/B4C-84/hp-09-reliability-and-model-evaluation). Sequential review after stock truth and shared context; merged baseline main `1622bda` / PR #25.

## Behavior and authorization

Explicit current-human dislikes, category dislikes, corrections, forgetting and shared equipment availability use bounded, default-empty profile facts. Temporary avoidance, another person's statements, source recipes, old messages and automatic refreshes cannot independently save facts. Existing authored preferences remain intact.

Planning and recipe-chat result acceptance saves transcript and profile effects atomically. Shared automatic effects require an exact completed job with a server-derived account/person identity, matching request, revision and effects. Recipe-chat transport retains that completed-job identity. Duplicate acceptance, forged effects and stale revisions are rejected or deduplicated. Browser-only fixture memory is deterministic and honestly labeled; shared fixture responses do not impersonate an authenticated AI job.

Both visible conversations display a persisted receipt with Undo and profile correction/forget controls. Local storage failure leaves the previous state and draft; completed recipe replies are retained for retry. Undo preserves both transcripts and the current composer. Typing, navigation and cooldown updates preserve available Undo.

## Local evidence

Node 24.21.0 and the committed npm lockfile. `npm run check`: 392 passing tests, one optional local Supabase integration skip. Independent `npm run build`: passed.

Desktop and 390×844 mobile at localhost:3100:

- Recipe Chat saved “I don't like mushrooms. We don't have an oven.” as two explicit facts, then displayed the Remembered receipt.
- Typing “Keep this new draft”, navigating to planning and using Undo removed those facts while preserving both recipe-chat messages and the new draft. Reload retained that result; older transcript text did not recreate the facts.
- Planning saved “I don't like vegetables.” as a category dislike. “No mushrooms tonight.” did not add a lasting fact. “I no longer dislike vegetables.” recorded a current false dislike; “Forget that I dislike vegetables.” removed it. Reload preserved the conversation and empty fact list.
- Recipe Chat remains visible alongside Suggestions for pilot households; loading and empty suggestion states, saved drafts and mobile controls were exercised.

Domain regressions cover source grounding, exact job/result binding, actor attribution, correction versus removal, old snapshot/inverse compatibility, persistence through serialization, and Undo after draft/view/cooldown changes.

The final package/transport slice adds direct-provider typed context, profile-aware fixture eligibility, expanded local-model evidence and disposable two-account database evidence. Actual household device acceptance remains HP-10; this evidence does not enable production households.
