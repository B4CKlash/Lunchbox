# Household pilot development

Use a separate development database. This branch does not migrate or enable the production household service. The existing Vercel project remains `no-name-4c11/lunchbox`; `main` is production and PRs receive protected previews.

## Browser-local workflow

```sh
source scripts/use-hackathon-tools.sh
npm ci
npm run dev
```

Without account configuration, the app keeps a household in the existing `lunchbox.household.v1` storage key. Visit `/meals` for the clearly labeled fixture helper, `/recipes` for favorites (assisted imports require the shared household and worker), and `/shopping` for stock checks, purchases, cooking and prepared portions. Planning never deducts pantry stock. Exact purchases and confirmed cooking use the same validated command path as shared mode.

Old version-1 data is extended by `ensurePilot`. Keep original pantry, recipe provenance, preferences, conversations and meals; each existing meal becomes its own batch, and draft meals remain recoverable proposals. A backup-only recovery archive preserves original browser bytes before import, account transitions, joining or resetting. Do not clear browser storage to resolve an error; use the account screen's backup download first.

## Local Supabase

Docker and Supabase CLI are prerequisites. `supabase/config.toml` names an isolated `lunchbox-household-development` stack. The project was verified with Supabase CLI 2.120.0 and local Postgres 17. Starting it applies the committed migrations. The migrations create authorized households, invitations, command history, worker jobs and stable account-to-person membership.

```sh
npx supabase@2.120.0 start
```

Copy `.env.example` to ignored `.env.local`. Obtain the local public key and server key from your local Supabase instance and configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `LUNCHBOX_HOUSEHOLD_ENABLED=true`. Keep credentials out of commits, screenshots and logs. Restart the app after changing public variables.

The local API is on port 54321, Postgres on 54322, and test mail on 54324. The committed auth redirects cover development ports 3000, 3001 and 3100. Create two development accounts and confirm their emails using local test mail. Sign in on `/account`, create the household on the first account, generate an invitation bound to the second account's email, then join with that code. Invitations last 48 hours; the app returns a code for you to share and does not send an email.

Membership binds each account to one person in the household roster. Name those people and set their individual preferences in the planner. This mapping lets “my Tuesday lunch” refer to the authenticated person.

## Mac inference

Follow [LOCAL_AI_WORKER.md](LOCAL_AI_WORKER.md). Ollama must listen only on loopback with cloud inference disabled. Set an explicit tested model and digest; the worker refuses a different digest. Configure the same strong worker secret on the server and Mac, and configure exactly one server-side `LUNCHBOX_WORKER_HOUSEHOLD_ID`. The Mac makes outbound requests to the app; do not expose Ollama or local Supabase publicly.

`LUNCHBOX_AI_MODE=demo` retains the recipe library's labeled sample provider. The planner's Local AI mode uses the worker separately. Set `LUNCHBOX_AI_MODE=ai` to route recipe-library generation and assisted imports through the configured local worker. No implicit Gateway fallback is permitted.

## Verification and deployment

```sh
npm run check
npm run build
LUNCHBOX_INTEGRATION_TESTS=1 node --env-file=.env.local --conditions=react-server --import tsx --test src/features/accounts/server-integration.test.ts
npm run evaluate:local
```

The integration test refuses nonlocal database hosts and uses disposable test users/households. A skipped integration suite in the ordinary checks is not proof of database behavior. See [the executed server verification](HOUSEHOLD_SERVER_VERIFICATION.md), [model reports](evaluations/), and [release tracker](HOUSEHOLD_PILOT_DELIVERY.md).

For a protected hosted preview, provision a separate hosted development Supabase project, apply migrations there, and configure preview-only variables in the existing Vercel project. Keep Deployment Protection enabled. Verify two independent sign-ins, conflict recovery, cancellation, worker interruption and the complete shopping/cooking flow before production activation. A localhost database and fixture demo do not satisfy hosted verification or the real household pilot.
