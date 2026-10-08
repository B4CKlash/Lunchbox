# Shared household and local worker verification

Verified on 2026-10-08 against the separate local Supabase development stack. No production Supabase project was connected or changed. The retained development owner and partner credentials are in ignored `.local/pilot-test-users.json`; no passwords, tokens, or service credentials belong in this document.

## Implemented boundaries

- `/api/household` verifies the Supabase bearer token with `auth.getUser`. The household is selected from authenticated membership. Creation is a one-time browser import, preserving the pilot revision, pantry, preferences, recipe provenance, conversation, migrated proposals, and idempotency receipts.
- `/api/household/commands` checks membership, validates the shared command schema, runs the existing domain reducer, and atomically compares the database revision before saving the snapshot and command receipt. It cannot replace an arbitrary existing snapshot. Retried commands return their original receipt; reused IDs with different commands fail.
- Invitations are owner-only, bound to the invited account's verified email, expire after 48 hours, and store only a SHA-256 token digest. The owner manually shares the returned code. No invitation email is sent by the application.
- Each authenticated account is bound to a stable household-person ID. The owner is assigned the first roster person at creation; joining accounts receive an unassigned person under a database lock. Assigned IDs cannot be deleted from the roster. Worker jobs receive the requesting account's person ID from authenticated membership, so “my lunch” cannot silently mean the owner's lunch when the partner asks.
- Browser database grants are revoked and all household tables use row-level security. Only server code holds the service-role credential. Public and authenticated clients cannot invoke the internal persistence or worker RPCs.
- Worker requests use a separate, minimum-32-character bearer secret and one configured household UUID. Worker credentials never authorize household membership administration. The Mac polls outward; Ollama is not exposed by these endpoints.
- Jobs capture the authoritative household snapshot, session, and revision. New requests of the same session/kind supersede earlier work. Claims use a 90-second lease, reclaim interrupted work, and fail visibly after three interrupted attempts. Heartbeat loss, cancellation, duplicate completion, old leases, and changed household revisions are handled explicitly.
- Returned planning operations are validated by a dry run of the same reducer. Completion saves a candidate result; it never applies a calendar or inventory change. Accepted actions still go through `/commands`.
- Latest-job lookup by household/session supports reload and resumption without modifying the household revision. Worker presence expires after two minutes. Manual household editing does not depend on worker availability.

## Executed checks

The final `npm run check` passed lint, TypeScript and 224 tests (the opt-in database suite was intentionally skipped in that run). `npm run build` passed and generated all 20 routes. The separate local Supabase integration run passed all 10 tests, with no skipped checks. These results include proposal dismissal and the planning-only job resumption filter.

Run normal checks with the pinned Node version. Focused tests cover token verification, nonmember and nonowner rejection, snapshot replacement rejection, revision guards, worker credentials/offline status, invalid proposed operations, cache ownership, recovery failure, and conflicts that would overwrite another member's complete pantry or session.

The opt-in integration suite runs the actual request handlers with real local Supabase sign-ins and database transactions:

```sh
source scripts/use-hackathon-tools.sh
LUNCHBOX_INTEGRATION_TESTS=1 node --env-file=.env.local --conditions=react-server --import tsx --test src/features/accounts/server-integration.test.ts
```

The suite refuses any database hostname other than `localhost` or `127.0.0.1`. It creates disposable owner, partner, and stranger users, then deletes their household and users after testing. Verified scenarios:

1. Missing bearer authentication, direct authenticated table/RPC access, and cross-household commands are denied.
2. Import preserves the pilot revision and receipts; a migrated command retry makes no change.
3. Two simultaneous commands at one revision produce one success and one conflict with the latest snapshot. Replaying the winner has no additional effect; reusing its ID for another action fails.
4. Only the owner can invite; a different email cannot accept; the partner can join and retry; expired invitations fail.
5. Offline status is honest, requests coalesce, heartbeat works, and cancellation rejects late completion.
6. An expired claim gets a new lease. The old worker cannot complete it. Identical completion retries succeed once, while changed output with the same lease is rejected.
7. Invalid proposed actions cannot finish; a household edit makes an otherwise valid late result stale.
8. Three interrupted attempts end in a visible failure. Latest-session lookup resumes the planning job without changing the household revision; a newer recipe extraction job cannot hide it.
9. Owner and partner receive different stable person IDs. A partner cannot spoof the worker's actor ID, and the database prevents removing an assigned person from the household snapshot.

Provider review also addressed stale auth callbacks, sign-in changes during requests, late responses from a previous account, and recovery when browser storage is full. A confirmed loss of membership hides the cached household even if recovery storage fails. Pending edits are saved with their original identifier and restored for the matching account. Pantry, preferences, entire planning sessions, and household-member lists cannot be automatically rebased over another person's edits; users review the current state and enter the edit again.

Queued edits also retain the revision of the UI snapshot that created them, so serialization cannot silently bless an older pantry/session snapshot with a fresh revision. Context callbacks are bound to the account and household that rendered them. Assistant results carry their original source revision and are saved atomically with their proposed changes. Browser-only composer drafts and assistant mode use the existing cache envelope, scoped to account, household, and session; typing does not change shared revisions or invalidate an active AI request.

## Deployment gates still required

- Apply and verify these migrations in a separate hosted development Supabase project before configuring a protected Vercel preview. The local stack is development evidence, not production provisioning.
- Configure the project's public Supabase URL/key, server-only service key, explicit household enable flag, worker secret, and scoped household UUID. Configure real account email delivery and allowed redirect URLs. Never use the development test accounts in production.
- Verify the protected preview using two independently signed-in devices, including losing connectivity, sign-out, account changes, conflicts, and resumption. Keep preview deployment protection enabled.
- Complete the pinned local-model quality/latency gate and full user-flow acceptance. This document verifies persistence and job transport; it does not claim that model evaluation or the real household shopping/cooking pilot has passed.
- Production activation and the actual household pilot remain separate release decisions. No production database migration or household enablement was performed as part of these checks.
