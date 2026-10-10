# HP-10 operator preflight — 2026-10-10

Preparation for Nate desktop → Nate mobile → two distinct people. No participant acceptance is claimed. Production household enablement remains off.

## Source and protected environment

Reviewed application baseline: main `4667b6f18a66c774fc108a5845c2cf4cce729a37`, including ordered merges #26–29. The protected pilot branch was restored to that source; its subsequent preview refresh and read-only verification are in progress. The stable onboarding origin remains `https://lunchbox-git-codex-household-pilot-no-name-4c11.vercel.app`, in canonical project `no-name-4c11/lunchbox`. Private access queries and invitation fragments are excluded from this record.

## Prepared and pending

- Pinned Node 24.21.0/npm 11.19.0 and committed lockfile; fresh npm ci, check (450 pass, one optional database skip) and build passed.
- Read-only development account inspection confirmed both intended accounts remain unconfirmed, with no prior sign-in and password setup pending. Both exact distinct account-to-person mappings are intact in the same revision-zero, empty kitchen. No real invitation was consumed or partner account changed.
- A diagnostic included an old preview share credential. It was revoked, replacement access was created with a 48-hour expiry, and readback verified the old grant absent. Only the scoped pilot alias was changed; application sign-in remains required. Replacement links are owner-only private files.
- The old worker shortcut targets a detached October 9 checkout. A current-source launcher and fresh runtime/presence verification are being prepared; do not use the old shortcut.
- No human desktop, mobile, two-user, actual shopping/cooking or recovery result has been recorded. Follow [the staged run guide](HOUSEHOLD_PILOT_RUN.md).

## Production gate

Production settings remain unchanged. Before participant handoff, recheck the absence of `LUNCHBOX_HOUSEHOLD_ENABLED` and `SUPABASE_SERVICE_ROLE_KEY` and canonical `/api/household` HTTP 503 `household_unconfigured`. HP-10 stays open through all partial stages. Passing local/model checks or deployment builds cannot enable production households.
