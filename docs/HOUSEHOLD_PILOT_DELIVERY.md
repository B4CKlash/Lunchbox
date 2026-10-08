# Household Pilot delivery tracker

The accepted objective is [HOUSEHOLD_PILOT_OBJECTIVE.md](HOUSEHOLD_PILOT_OBJECTIVE.md). Work starts from remote main `7c9c759`; continuous recipe-feed PR #22 remains separate. This is an integration-owned change coordinating contracts, storage, planning, AI and frontend. Existing recipe imports, canonical ingredient resolution and provenance remain part of the app.

Linear project: **LunchBox — Household Pilot**. Publishing is pending Linear reauthentication (confirmed 2026-10-08). These issue definitions are the recoverable publishing queue; they are not evidence of completed release gates.

| Issue | Milestone / owner | Dependencies | Acceptance examples |
|---|---|---|---|
| HP-01 Collaborative workspace | 1 / frontend | none | Conversation, focused recipe, person-specific calendar and groceries stay coordinated on desktop/mobile; leave and resume; fixtures clearly labeled. |
| HP-02 Shared planning commands | 2 / integration + planning | HP-01 | One live calendar; coverage per person; one pasta batch covers three occasions, ingredients count once; reject pre-preparation or excess allocations; receipts and undo. |
| HP-03 Recovery and migration | 2 / pantry | HP-02 | Back up original browser data; preserve pantry, preferences, provenance, conversation, undated meals and drafts; never merge batches by recipe name. |
| HP-04 Authorized household sync | 2 / integration | HP-02, HP-03 | Separate development database; owner/partner membership and expiring invitation; deny nonmembers; CAS conflict surfaces current state; account switch cannot leak or overwrite data. |
| HP-05 Local worker and model adapter | 3 / AI | HP-04 | Outbound authenticated worker; Ollama binds loopback and cloud is disabled; queued/running/canceled/stale/duplicate/expired jobs handled; no paid fallback. |
| HP-06 Resident planning assistant | 3 / AI + frontend | HP-01, HP-02, HP-05 | Favorite retrieval, new vegetables recipe, candidate revision, reviewable multi-day proposal; only explicit single placement applies; stale result cannot claim completion. |
| HP-07 Shopping and cooking loops | 4 / planning + pantry | HP-02, HP-04 | Unknown stock creates checks without invented amounts; horizon separate from visible calendar; purchases survive cancellation; cooking actual yield, freezer reservations, consumption and retries remain consistent. |
| HP-08 Feedback and personal context | 4 / AI + frontend | HP-06, HP-07 | Individual/household preferences, equipment, favorite/rating/make-again/notes persist and inform suggestions; feedback never silently rearranges meals. |
| HP-09 Reliability and model evaluation | 5 / integration + AI | HP-03–HP-08 | Check/build; authorization/concurrency/migration/uncertain stock/stale proposal/worker loss/duplicate operation tests; 20 scenarios twice, >=90% completion, zero unsupported action claims or invalid changes; measured latency and pinned digest. |
| HP-10 Protected preview and real household pilot | 5 / integration + household | HP-09 | Protected preview verified; both devices share one household; complete objective's nine-step demo and real shopping/cooking cycle before production enablement. |

## Release status

Implementation is on `codex/household-pilot` in an isolated worktree. No production database migration or pilot enablement has occurred.

| Gate | Evidence / status |
|---|---|
| Domain, UI, recovery and transport implementation | Implemented; independent review fixed queued-snapshot races, account-switch callbacks, uncertain-stock display/inference, and atomic assistant result persistence. |
| Check and production build | Passed locally: lint, TypeScript, 224 tests (one opt-in database suite skipped in ordinary checks), and all 20 production routes. The database suite also ran separately. |
| Real local database | Ten opt-in Supabase checks pass, including authorization, invitations, concurrency, actor identity, cancellations, interrupted leases and duplicate completion. See [server verification](HOUSEHOLD_SERVER_VERIFICATION.md). |
| Browser interaction and household loops | Desktop/mobile fixtures, purchases surviving cancellation, cooking/freezer/feedback, account-separated sync, uncertain stock and draft resumption verified. See [browser verification](HOUSEHOLD_BROWSER_VERIFICATION.md). |
| Local AI quality | Initial 9B baseline failed (31/40, 77.5%). A stricter 27B evaluation is in progress. A correct person/date is part of task completion; a schema-valid response alone does not pass. |
| Protected hosted preview | Pending branch deployment and separate hosted development Supabase configuration. The Vercel CLI can access the existing project; its connector currently lacks this team scope. |
| Linear roadmap | Publishing queue above is ready; connector reauthentication still required. No Linear issue IDs are fabricated. |
| Real household cycle | Pending household participation. This cannot be replaced by fixture tests. |

Production stays gated until hosted verification and the requested real planning, shopping and cooking cycle are complete. The continuous recipe-feed PR remains independent.
