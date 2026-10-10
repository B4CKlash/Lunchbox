# HP-10 operator preflight — 2026-10-10

Preparation for Nate desktop → Nate mobile → two distinct people. No participant acceptance is claimed. Production household enablement remains off.

## Source and protected environment

Reviewed application baseline: main `4667b6f18a66c774fc108a5845c2cf4cce729a37`, including ordered merges #26–29. Restored `codex/household-pilot` and refreshed its protected preview at `dd4fb0d0d403ccc1b25fdd4a6f06980744ceba42`; the additional commit changes documentation only. Deployment `dpl_2PXV2yg2MfvX7gf2W7iruK8fjNfu` is READY at immutable URL `https://lunchbox-o9txp2hoh-no-name-4c11.vercel.app`. The stable onboarding origin remains `https://lunchbox-git-codex-household-pilot-no-name-4c11.vercel.app`, in canonical project `no-name-4c11/lunchbox`. Private access queries and invitation fragments are excluded from this record.

Branch-scoped configuration uses the separate development database and real pilot household, with AI mode and the local-worker backend. The desktop account page loads with personal invitation/password instructions. Protected access without application sign-in returns HTTP 401 `sign_in_required` from `/api/household`. This verifies access boundaries and the unauthenticated screen, not participant onboarding or an authenticated user flow.

## Prepared and pending

- Pinned Node 24.21.0/npm 11.19.0 and committed lockfile; fresh npm ci, check (450 pass, one optional database skip) and build passed.
- Read-only development account inspection confirmed both intended accounts remain unconfirmed, with no prior sign-in and password setup pending. Both exact distinct account-to-person mappings are intact in the same revision-zero, empty kitchen. No real invitation was consumed or partner account changed.
- A diagnostic included an old preview share credential. It was revoked, replacement access was created with a 48-hour expiry, and readback verified the old grant absent. Only the scoped pilot alias was changed; application sign-in remains required. Replacement links are owner-only private files.
- Reissued only Nate's exact pending account invitation at 20:07 UTC after confirming it had never been accepted. A private Nate-only desktop start file contains the replacement preview access and invitation, plus separate mobile access for normal password sign-in later. The preview grant expires October 12 at 20:03 UTC; account invitation expiry follows the development auth configuration and must be rechecked if onboarding is delayed. Nate accepts the invitation and chooses his own password. The partner's invitation/account remains untouched and will need an expiry check before stage 3.
- The old worker shortcut targets a detached October 9 checkout; do not use it. An owner-only `start-hp10-ai.command` launcher now anchors the current repository, verifies all 19 frozen model-source hashes and the reviewed worker, and obtains fresh protected-preview access. An isolated CLI directory prevents the expired root `.env.local` OIDC token from overriding fresh access; that original file remains untouched. Private household credentials override redacted downloaded values only inside the launched worker.
- No human desktop, mobile, two-user, actual shopping/cooking or recovery result has been recorded. Follow [the staged run guide](HOUSEHOLD_PILOT_RUN.md).

## Live worker preflight

Ollama 0.40.1 serves only loopback port 11435 with cloud disabled. The evaluated `qwen3.5:27b` digest is `2d2e4b8fc7c0479b70f8cba9fc8bdb49a3c9a43a8a6da3873b724c9fca4672ef`, with thinking off. The unrelated existing server on port 11434 was left untouched. Current files match the final merge-review model evidence, including its retained category-generation and prose limitations; no new inference result is claimed here.

After verifying zero queued/running jobs, the current worker's one-poll probe exited successfully and registered fresh hosted presence without claiming a job. The continuous worker was then started for Nate's session. Readback at 20:12:58 UTC showed presence at 20:12:55 UTC and launcher status running. Its protected access expires October 11 at 08:12 UTC; the launcher stops before expiry and must be reopened to reconnect. Keep the Mac powered, awake and online. Presence proves connectivity, while the four actual inference paths remain participant acceptance work.

## Production gate

Read-only checks at 20:12 UTC confirmed production has neither `LUNCHBOX_HOUSEHOLD_ENABLED` nor `SUPABASE_SERVICE_ROLE_KEY`. Canonical `https://lunchbox-snowy.vercel.app/api/household` returns HTTP 503 `household_unconfigured`. No production settings were changed. HP-10 stays open through all partial stages. Passing local/model checks, deployment builds or worker presence cannot enable production households.
