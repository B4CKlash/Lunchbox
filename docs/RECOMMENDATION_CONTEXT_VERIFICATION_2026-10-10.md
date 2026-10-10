# Shared recommendation context — 2026-10-10

Follow-up for [HP-06 / B4C-81](https://linear.app/b4cklash/issue/B4C-81/hp-06-resident-planning-assistant), [HP-08 / B4C-83](https://linear.app/b4cklash/issue/B4C-83/hp-08-feedback-and-personal-context), and [HP-09 / B4C-84](https://linear.app/b4cklash/issue/B4C-84/hp-09-reliability-and-model-evaluation).

The merged baseline is main `1622bda`, including PR #25. This slice follows the stock-truth fix and shares its canonical stock projection. Pantry/storage, planning, AI workflow, frontend and integration changes are coordinated in the sequential review branches.

## Behavior

- One assembler supplies household preferences, selected people, equipment, session constraints, current stock/checks, attributed feedback and exact favorite snapshots.
- Worker suggestion and recipe-chat calls receive the authenticated actor. Recipe workspace displays the planning audience and exposes the retained Chat view.
- The semantic comparison token changes when kitchen knowledge changes, excludes transcript/feed/revision bookkeeping, and rejects late feed results. It is a comparison token; authenticated revision checks authorize writes.
- Feedback entry records the current person. Favorite retrieval retains different people's opinions and legacy household opinions.
- Composer, conversation navigation and cooldown bookkeeping preserve the existing domain Undo.

## Local evidence

Pinned Node 24.21.0 with committed npm lockfile. `npm run check` passed (373 passing tests, one optional Supabase integration skip). `npm run build` passed independently.

Browser at localhost:3100, desktop and 390×844 mobile: pilot recipe workspace displays “Cooking for You and Partner”; Suggestions loading and the 10-minute empty state display correctly; Chat opens without hiding the planning link, accepts a demo plan-review request and saves the reply. An unsent recipe draft and the selected Chat view survive reload. Mobile layout remains contained and the composer is operable.

Domain regression covers changed-person stale response rejection, conflicting attributed opinions, equipment changes, and unchanged tokens after transcript/revision/feed bookkeeping. Rejected recipe context changes once; returned candidates do not create a refresh loop.

Profile and package effects, new model scenarios, authenticated failure/retry, and actual household acceptance are verified in their later slices. This local evidence does not close HP-10 or enable production households.
