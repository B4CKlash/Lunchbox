# Run the household pilot — Nate desktop first

Status: prepared guide, no participant run completed. Tracks [HP-10 / B4C-85](https://linear.app/b4cklash/issue/B4C-85/hp-10-protected-preview-and-real-household-pilot). Start with the [operator preflight record](HP10_PREFLIGHT_2026-10-10.md); earlier synthetic results are in [hosted verification](HOUSEHOLD_HOSTED_VERIFICATION.md). Use the protected development preview and development database. Production household enablement stays off. Neither the solo desktop run nor the same-account mobile follow-up satisfies HP-10.

## Before Nate starts — operator preparation

- Pin a protected preview built from current post-PR-29 main, record its exact SHA/immutable URL, and verify the existing development database, auth redirect origin, household configuration and both conversations. October 9 hosted evidence does not verify this new source. Keep preview protection enabled.
- Verify Nate's account-to-person mapping without consuming his invitation. Privately verify his invitation/access expiry and hand him the correct personal link. Preserve the partner's account and invitation untouched; do not consume, regenerate or sign into them for this solo run.
- Start the household-scoped Mac worker with the tested pinned `qwen3.5:27b`, thinking off/digest verified, private loopback Ollama and cloud disabled. The UI must honestly show Local AI. Manual editing remains available if the worker stops.
- Preserve a recovery copy before account transitions. Recheck production flag/key absence and canonical `/api/household` HTTP 503 `household_unconfigured`. Record sanitized preflight results; no secret links, credentials or cookies in public evidence.

## Stage 1 — Nate on the computer, about 20–30 minutes

Nate needs his computer/browser, private personal access link, and a password he chooses himself. Have one real favorite recipe, actual food/equipment preferences, a few real pantry quantities, an upcoming planning date and shop-through date ready. Keep the Mac awake and online for AI requests. No partner participation or joint appointment is needed now.

1. **Open and onboard.** Accept only Nate's invitation and choose a password privately. Confirm the displayed identity and kitchen, with no unexpected sample stock or silent import. If the link expired, stop onboarding and report only “expired” or sanitized error text; the operator handles a replacement. Do not send passwords or private URLs in chat.
2. **Enter a small actual pantry.** Review an individual count, a measured quantity and a package count, using the household's real numbers. Examples of supported wording are `10 apples`, `1000 g beans`, and `10 cans of beans`; these are examples, not stock to fabricate. Select the canonical ingredient and explicit **Set current total** or **Add stock** before saving. Package contents remain unknown. Reload and confirm the entries remain separate and truthful. Add a real partial/open package only if one exists.
3. **Try the planner.** Set real dates/horizon and select Nate as the recommendation audience initially. Mark only Nate's upcoming Tuesday lunch covered; the partner's coverage stays open. If the library is empty, first paste/import your favorite recipe, review it against the source and save it as a favorite. Retrieve that favorite, request a vegetable-focused candidate, then revise cuisine or effort. Inspect the recipe steps and per-person portions. Discussion must not schedule meals or consume pantry stock.
4. **Try both learning conversations.** In `/meals`, state a true personal lasting dislike; wait for the successful **Remembered…** receipt and reload. In `/recipes` → Chat, state a true shared equipment fact. Planning, suggestions and recipe chat should respect the selected audience and kitchen facts. “No X tonight” stays temporary; statements about another person require clarification. Do not enter partner preferences on their behalf.
5. **Check Undo and return.** After a memory save, type a new unsent draft, navigate to the other conversation and use Undo before accepting another household change. The prior profile returns, transcripts and the draft remain, and reload/history does not recreate the undone fact. Intentionally re-enter the actual current preference if needed. Note any friction or error, then leave and return once.

Also exercise all four worker paths over these stages: planning, recipe Suggestions, recipe Chat with a request that requires actual inference, and an assisted recipe import. Explicit preference saves can be deterministic, so they alone do not prove Chat inference. Review imports against their source and save only after confirmation; imported text must never create a lasting profile fact.

Stop here if desired. Record desktop/browser, deployment SHA, what passed/failed and any confusing wording. Real purchases, cooking and eating can happen later; do not click them complete ahead of the actual event.

## Stage 2 — Nate on mobile, same account

Open the same protected preview on Nate's normal phone browser. Use normal password sign-in with the password chosen on desktop; do not replay the one-time invitation. The operator can privately provide mobile preview access separately if needed. Leave the partner invitation untouched.

- Confirm the same Nate identity, kitchen, pantry/packages, saved facts, conversation and calendar. Check loading/error behavior and that mobile controls fit.
- Make one small intended change on the phone and verify it on desktop; make one desktop change and verify it on the phone. Reload both. This proves same-account device continuity, not two-person attribution or membership acceptance.
- If comfortable, briefly disconnect the phone, type a distinct draft and attempt one safe manual change. Visible pending/error state must preserve the draft and data. Reconnect and use the provided retry; the effect should appear once on both devices. Do not clear browser storage or repeatedly submit a purchase/cook action.
- Optionally coordinate a brief worker pause with the operator: manual planning/pantry/shopping still work, AI reports offline/unavailable, and a later retry succeeds without a paid fallback. Record anything not exercised as pending.

## Real shopping/cooking — when convenient

Plan one coherent batch with selected placements and check combined groceries. Only after the actual shop record actual measured/package purchases; cancel an appropriate planned meal and confirm purchased stock remains. If measured stock is insufficient but unknown-size packages may cover the remainder, shopping must show known stock plus an unverified stock check, without also calling the remainder a definite purchase. Confirm sufficiency only after checking; changed demand or stock reopens checks.

Actually cook, record actual yield/freezer portions and schedule prepared portions later. Normal sufficient measured stock deducts; package consumption/remaining weight is never guessed. Unknown remaining packages stay unknown unless confirmed. Prepared portions do not add recipe ingredients to shopping again. Record eating explicitly, then leave Nate's rating/make-again/cooking note. If a real package purchase is immediately undone as a controlled check, verify stock/check/history restoration and deliberately re-record the actual purchase once. Retain actual dates and quantities in the run notes.

## Stage 3 — two distinct people, later: the HP-10 gate

Arrange the partner session only after the solo/mobile experience is usable. The partner accepts their own private invitation and chooses their own password on their own physical device. Verify distinct account-to-person mappings in one shared kitchen.

Complete or jointly verify the objective's nine steps: (1) only one person's Tuesday lunch covered; (2) favorite and new vegetable candidate; (3) effort/cuisine revision; (4) one pasta batch across occasions; (5) selected placements and combined groceries; (6) one person eating out while the other allocation remains; (7) actual purchase surviving a cancellation; (8) actual cooking/freezer portions and later prepared meals; (9) separately attributed feedback and leave/resume. Earlier Nate-only work can be evidence but cannot replace the partner's participation and readback.

Also verify partner-device profile/package persistence and correct audience scope, each person's own differing feedback, both conversation learning paths, transcript-preserving Undo, and stale recommendation rejection after a meaningful partner change. Run one controlled concurrent session-settings edit: one save wins, the other's old draft conflicts and survives, then **Load current settings** supports an explicit resolution. Exercise network and worker recovery with both people, including any cases left pending earlier. An ambiguous preference or statement about the other person must not silently create a personal fact.

## Evidence and release decision

For each stage record date, exact SHA/preview, tested model/digest, device/browser, steps passed/failed/not observed, sync/retry/conflict results and practical friction. Never publish access links, account IDs, passwords or cookies. Watch the known category-generation safe-rejection gap and model wording mismatches; do not weaken preferences to force a recipe.

HP-10 passes only after both people complete the real planning/shopping/cooking cycle comfortably without a parallel meal plan and required persistence, attribution, Undo/conflict/network/worker recovery cases are observed. Lost/duplicated effects, wrong-person attribution, invented quantities/conversions, silent overwrites or source corruption block release until fixed and rerun. Pending cases leave the gate open. Production enablement remains off throughout these stages and is a separate reviewed integration action after the completed evidence is accepted.

## Run record — fill as each stage happens

| Evidence | Result |
| --- | --- |
| Date, source SHA and immutable preview | Pending |
| Model/digest and fresh worker presence | Pending |
| Nate desktop device/browser; passed/failed/pending cases | Pending |
| Nate mobile device/browser; bidirectional reload/sync | Pending |
| Real planning, shopping, cooking and eating dates | Pending |
| Partner device/browser and own account acceptance | Pending |
| Nine-step conversation and separate feedback | Pending |
| Profile/package scope, Undo and context invalidation | Pending |
| Conflict, network loss and worker pause/retry | Pending |
| Friction or need for a parallel plan, each person | Pending |
| Fixes required and affected cases rerun | Pending |
| Household acceptance and integration release review | Pending — production off |
