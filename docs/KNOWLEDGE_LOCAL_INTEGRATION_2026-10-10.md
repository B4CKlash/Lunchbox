# Profile and package persistence: local integration evidence

Verified on 2026-10-10 in the isolated `codex/local-knowledge-integration` checkout, based on `430b826` (stock truth, shared kitchen context, profile receipts, evaluator extension, and the resolved package-stock implementation). This supplements [the household server verification](HOUSEHOLD_SERVER_VERIFICATION.md).

The opt-in suite ran actual request handlers against the existing local Supabase development stack at `http://127.0.0.1:54321`, with real local sign-ins and database transactions. It passed **16/16 tests**, including the suite wrapper and 15 scenario tests, with no skips. The suite creates random disposable owner, partner, and stranger accounts; its cleanup now verifies that their household and users are gone. No retained development account or hosted project was used.

Three added scenarios prove the following:

- A partner's explicit mushroom dislike is learned only under the partner's authenticated person ID. Worker completion rejects missing deterministic facts and owner-scoped substitutions. Acceptance rejects a nonexistent job, changed requester, changed request, changed reply, and a nonmember. Another member can resume the exact completed result without becoming its speaker. Transcript and fact save in one receipt; completion and acceptance retries add nothing. Partner readback preserves provenance. Undo restores prior facts while keeping the transcript, and retrying the original receipt after Undo cannot relearn the fact.
- A planning request records unavailable household equipment under the original speaker. Forged transcript authorship fails. Partner acceptance and owner retry preserve one receipt. A later explicit equipment correction prevents acceptance of an earlier completed job, even when its command envelope uses the current revision.
- Ten cans plus a purchase of two persist as twelve cans, with one dated purchase-history entry and matching partner readback. Retrying the purchase adds neither stock nor history. Undo restores both prior values, and retry after Undo does not replay the purchase. Adding a jar to an opened or partial jar preserves an uncertain count and the exact purchase history. Container counts never alter measured pantry balances.

The existing authorization, invitation, concurrent-write, worker lease, cancellation, actor-binding, direct-placement, purchase-provenance, and prepared-food correction scenarios also passed.

Commands used the pinned Node 24.21.0 and committed npm lockfile:

```sh
source scripts/use-hackathon-tools.sh
npm run check
LUNCHBOX_INTEGRATION_TESTS=1 node --env-file=/Users/natedawg/.codex/worktrees/household-pilot/LunchBox/.env.local --conditions=react-server --import tsx --test src/features/accounts/server-integration.test.ts
npm run build
```

`npm run check` passed lint, TypeScript, and 412 tests; the separate opt-in database suite was its one intentional skip. The production build passed. The ignored environment file supplied local credentials without printing their values. Before creating any client, the suite requires plain HTTP and a hostname of `localhost` or `127.0.0.1`.

Worker replies here are controlled fixtures submitted through the real completion API. These results establish local persistence, authorization, validation, retries, readback, and Undo; they do not establish local-model quality, browser acceptance, a protected hosted preview, or real-household readiness. No deployment, hosted database migration, real invitation, or household activation was performed.
