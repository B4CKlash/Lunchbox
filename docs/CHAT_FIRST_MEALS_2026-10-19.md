# Chat-first Meals & Plan — October 19, 2026

Implementation for [B4C-96](https://linear.app/b4cklash/issue/B4C-96) and [B4C-97](https://linear.app/b4cklash/issue/B4C-97), under [B4C-93](https://linear.app/b4cklash/issue/B4C-93). Branch: `codex/chat-first-meal-planning`, based on main `28b2935`. This is application code with local verification, pending integration review and household acceptance.

## Result and scope

`/meals` starts with the composer and concise recipe cards. Suitable saved recipes precede other ideas; current time, ingredient, equipment, rejection and feedback constraints still apply. The newest candidate snapshot wins before eligibility is checked, so an older saved version cannot bypass a current conflict. Cards retain honest saved, authored-example, AI and import attribution. Seven authored examples remain available; the list is bounded to ten suitable ideas, not a promise of ten generated recipes.

Keep several recipes, choose each total portion count and review combined groceries without dates. Requirements scale from base servings, merge by canonical ingredient ID plus unit, account for uncooked existing batches through the saved shopping horizon, then subtract stock once. The preview distinguishes additional purchases from total shortages including existing commitments. Unknown balances and unresolved package contents remain fresh checks; no conversion or prior sufficiency confirmation invents an amount.

Scheduling remains optional. A selected total carries into the existing cook-tonight/plan-ahead form. Returning to groceries and changing that total preserves meal allocations in the mounted form. Successful manual batches, explicit chat placements and accepted proposals transfer matching selected demand into the saved plan. Partial placement retains only the remaining unscheduled portions. Changed snapshots, changed raw totals and remove/re-keep edits during a save are preserved. Planning never deducts inventory.

Conversation history, proposal review, legacy undated meals, Undo and preferences remain reachable through contextual controls and disclosures. Rejecting a recipe removes its kept demand; returning to a rejected recipe requires explicit Reconsider. Kept recipes display current preference conflicts and offer an explicit choice when an updated snapshot is available. Inspecting an older kept snapshot does not overwrite a newer candidate.

The existing account/household/session-scoped composer cache now retains raw portion text, including unfinished or invalid entries. Invalid totals suppress the combined calculation and scheduling actions. No new household schema, storage key, provider, route, dependency or AI transport was introduced. Calendar/date allocation drafts remain component-local until saved; this change does not add durable allocation-form recovery.

## How to try it

1. Start with the pinned Node runtime, `npm ci`, then `npm run dev`.
2. Open `/meals?sampleKitchen=1` for a clearly labeled, memory-only kitchen. Keep two recipes and choose **See groceries**. Change their totals; no dates are required.
3. Open a recipe and save it to the library in this experiment. Back in ideas, it appears before suitable unsaved options, while provenance remains visible.
4. From groceries, choose **Plan this recipe**, set preparation and meal dates, review, then save. Remaining selections stay in groceries; saved demand counts only with existing plans.
5. Use the ordinary browser kitchen to check reload persistence. Sample/random experiments deliberately reset on reload and never write the saved kitchen.

## Verification

`npm run check`: lint and TypeScript passed; **494 tests passed, 1 optional integration test skipped, 0 failed**. `npm run build`: passed. Focused domain/cache coverage includes combined shortages and shared stock, existing commitments/horizons, canonical ID/unit separation, uncertain/package stock, validation/purity, saved affinity after filtering, raw draft recovery and partial/manual/chat/proposal reconciliation.

| Boundary or state | Evidence |
| --- | --- |
| Entry and discovery | Desktop and phone-width browser walkthrough: composer precedes concise cards; a suitable saved pasta recipe moved ahead of an unsaved recipe covered by known stock. |
| Undated combined preview | Two selected recipes showed scaled shortages and existing commitments without creating dates or changing stock. A blank total suppressed all calculations and planning; correcting it restored the preview. |
| Cache and recovery | Ordinary browser reload preserved both selected snapshots, their totals, the groceries view and an empty/invalid portion entry. Unsent conversation text survived reload and switching assistant modes. Cache failure/ownership cases also pass focused tests. |
| Serving plan | Prepared a four-portion Sunday October 25 batch for Monday October 26 and Tuesday October 27 lunches; review/save succeeded. The saved recipe left the selection, and the other selected recipe retained four portions. A later grocery round trip and total change retained an unsaved allocation. |
| Alternate scheduling | An explicit example-chat placement saved two of four selected portions; groceries retained two unscheduled portions and showed 180 g selected pasta + 180 g already planned = 360 g total shortage, rather than duplicating all four. Partial proposal selection uses the existing shared yield calculation and focused tests. |
| Uncertain stock | Two recipes plus an existing batch showed tomatoes as a 750 g stock check, not a definite purchase. Explicit measured total 800 g cleared the check; Undo restored it without discarding selections. |
| Empty / unavailable | No-fit ideas, an empty grocery selection and invalid total states were checked. Private AI without a connected household displayed its setup guidance; returning to Examples retained the draft. |
| Responsive / runtime | Browser phone override rendered at an effective 375 px with content width 375 px and no horizontal overflow. Normal viewport restored. Fresh post-build browser console had no warnings/errors; `/meals` returned 200. |

[Desktop discovery](evidence/chat-first-2026-10-19/desktop-discovery.png) · [Desktop combined groceries](evidence/chat-first-2026-10-19/desktop-combined-groceries.png) · [Phone-width combined groceries](evidence/chat-first-2026-10-19/mobile-combined-groceries.png)

## Remaining boundaries

The planning conversation still uses the existing authored Examples or authenticated private-worker path. This change does not connect it to the separate Gateway recipe API or fix the previously observed no-card/invalid-output failures. Live queued/running/error/retry responses require a connected household and worker and were not exercised in this local walkthrough. [B4C-94](https://linear.app/b4cklash/issue/B4C-94) and [B4C-95](https://linear.app/b4cklash/issue/B4C-95) retain that work.

An evolving request brief and natural-language relative dates remain [B4C-98](https://linear.app/b4cklash/issue/B4C-98). Multi-recipe bulk scheduling, in-recipe stock onboarding, verified seasonality/nutrition and external calendars are separate scope. The preview is a date-free planning view, not a persisted retailer shopping order. Physical-phone, two-person and real shopping/cooking/recovery acceptance remain [B4C-85](https://linear.app/b4cklash/issue/B4C-85); no local check, PR or merge enables production household services. Design/GTM acceptance remains [B4C-99](https://linear.app/b4cklash/issue/B4C-99).
