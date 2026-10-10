# Ordered PR review — 2026-10-10

Follow-up to HP-06 / B4C-81, HP-07 / B4C-82, HP-08 / B4C-83 and HP-09 / B4C-84. This review checked each intermediate PR as well as the combined stack. HP-10 / B4C-85 remains the production household acceptance gate.

## Review findings and fixes

- **#26 stock truth:** independent review found no blocker. The 900 g → Some → add 100 g regression retains uncertainty, retry-safe purchase history and one canonical ingredient/unit projection. Seventy-four focused tests passed.
- **#27 feedback ownership:** moved authentication into the first PR that attributes feedback. New direct and proposed feedback uses the authenticated person. Existing proposals keep their original author. Another person's or legacy household feedback ID cannot be overwritten. The intermediate check passed 376 tests with one optional database skip; build passed.
- **#28 profile ownership and save recovery:** promoted personal-fact authorization and recipe-chat persistence recovery before merging this intermediate slice. Obsolete cached replies cannot reuse a newer revision, and global persistence recovery stops offering an already-saved reply again. The intermediate check passed 404 tests with one optional database skip; build passed.
- **#28 remembered target identity:** corrections and forgetting preserve one exact, scoped fact when ingredient references appear, disappear or return with the same ID. Different IDs with the same wording, multiple known identities or conflicting remembered facts ask for clarification with zero lasting effects. Independent lifecycle probes covered recipe-only references, category separation, aliases, scopes, mixed statements and input immutability.
- **#29 stale stock review:** the natural entry form retains the stock and identity knowledge shown when review begins. A newer measured balance, package purchase, qualitative observation or identity change blocks an old absolute total. Safe additions and unrelated transcript/revision updates remain usable. Six new regressions cover this boundary.

## Final source verification

Node 24.21.0 and npm 11.19.0 with the committed lockfile and `npm ci`.

- `npm run check`: **450 passed, zero failed, one optional database skip**; lint and TypeScript passed.
- `npm run build`: passed.
- Separate opt-in actual local Supabase suite: **16/16 passed, no skips**, using disposable two-account data. Profile jobs, partner readback, stale/duplicate acceptance, purchases, package uncertainty and Undo passed. Temporary integration resources were cleaned up by the suite.
- Browser regression: opened a ten-apple absolute review, saved twelve apples through the separate pantry editor, then attempted the old review. The old save was rejected and twelve remained. Explicit re-review and save restored ten. The draft remained available after rejection.
- Mobile package review retained the original statement, explicit total interpretation, canonical ingredient, whole count and unknown-contents explanation. Document client/scroll widths were both 375 px inside the requested 390 × 844 viewport; no horizontal overflow. The temporary viewport override was reset.

## Expanded local model evidence

The final frozen source passed all 33 scenarios twice using the pinned private-loopback `qwen3.5:27b`, thinking off. [Report](evaluations/local-ai-qwen35-27b-merge-review-2026-10-10.md) and [raw outputs](evaluations/local-ai-qwen35-27b-merge-review-2026-10-10.json): **64/66 (97.0%) overall, original 40/40 (100%)**, above the established 90% thresholds. Both required batch scenarios passed twice. Profile effects passed 12/12; package cases passed 8/8. There were 48 inference runs and 18 deterministic observations; inference median/p95 were 13.259 s / 27.205 s. The automated guards recorded zero accepted unsupported completion/package-sufficiency claims, invalid proposed changes or input mutations. All 19 SHA-256 model-source hashes matched at start, finish and independent review.

Category-dislike generation failed safely in both runs (0/2) after candidates conflicted with saved preferences/equipment; neither run returned an accepted candidate or effect. Category memory itself passed. This generation gap remains visible despite the aggregate passing score. The earlier 63/66 implementation report remains historical evidence; it is not substituted for the corrected source.

Independent reviewers inspected accepted replies and typed effects across the original twenty scenarios and all thirteen additions. The bounded automated completion/action-claim checks do not establish full prose precision. Retained wording limits include a placement suggestion saying two portions each while its correct typed allocation is one each, a one-pot description paired with separate pasta/sauce steps, horizon described as shopping time, and an unquantified purchase clarification offering vague size estimates while proposing no purchase. A package explanation correctly retains 100 g known stock and 500 g unverified need but suggests weighing one box then updating both; each package's actual contents still requires verification. None of these outputs applies an action, proposes a fabricated package conversion, or claims a completed purchase. The structured proposals and recipe steps remain reviewable before saving.

## Ordered merges and production gate

| PR | Verified merge commit |
| --- | --- |
| [#26](https://github.com/B4CKlash/Lunchbox/pull/26) | `95ad358573ed7d21c0155729b7eb860de1c9e0a2` |
| [#27](https://github.com/B4CKlash/Lunchbox/pull/27) | `7ea7064f6b25f32f27829bcc8a727183aed00c23` |
| [#28](https://github.com/B4CKlash/Lunchbox/pull/28) | `3316564b2dbc5ba9e0cd90bb48590ca93baffb88` |
| [#29](https://github.com/B4CKlash/Lunchbox/pull/29) | Prepared after #28; final check and merge outcomes are recorded on the PR |

Each merged PR passed GitHub checks and both Vercel previews at its final head. The historical secondary #28 Git-information retrieval failure cleared on the reviewed heads; preview protection was retained.

The canonical project is `no-name-4c11/lunchbox` (`prj_dSt1KxzmiT2osc1Or45xls4SiJ9z`). Read-only production environment inspection found neither `LUNCHBOX_HOUSEHOLD_ENABLED` nor `SUPABASE_SERVICE_ROLE_KEY`. The canonical production household endpoint returned HTTP 503 `household_unconfigured`. Main merges deploy application code normally; no production flags, credentials, hosted migrations or real invitations were changed.

[HP-10](https://linear.app/b4cklash/issue/B4C-85/hp-10-protected-preview-and-real-household-pilot) remains open for real two-device planning, shopping, cooking and network recovery acceptance. Local test data and model scores do not satisfy that gate. Package conversions, purchase rounding, inferred taste scoring, nutrition tracking and broader recommendation redesign remain deferred.
