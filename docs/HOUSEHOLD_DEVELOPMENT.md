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

## Bootstrap the protected hosted pilot

This sequence is still pending. Use the existing Vercel project `no-name-4c11/lunchbox`, restrict variables to Preview and branch `codex/household-pilot`, and retain Deployment Protection. Both people need normal access to the protected preview in addition to their separate LunchBox accounts.

1. Identify a separate hosted development Supabase project. Authenticate the Supabase CLI privately, confirm its project reference, then link and inspect the migration plan before applying it:

   ```sh
   npx supabase@2.120.0 link --project-ref YOUR_DEVELOPMENT_PROJECT_REF
   npx supabase@2.120.0 db push --dry-run
   npx supabase@2.120.0 db push
   ```

   All five committed migrations, `202610080001` through `202610080005`, must be applied in order. Confirm the selected target is the development project before the final command. Keep database passwords and access tokens in the CLI's private credential flow.
2. Configure confirmed-email delivery for both pilot addresses in development Supabase. In the branch's Vercel Preview settings, configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `LUNCHBOX_HOUSEHOLD_ENABLED=true`, `LUNCHBOX_AI_BACKEND=local-worker`, and initially `LUNCHBOX_AI_MODE=demo`. Redeploy; public variables are embedded at build time. Set the Supabase site URL to this protected preview origin and allow its exact `/account` email-confirmation redirect. If a later deployment changes the origin, update this redirect before signing up there.
3. Open `/account` from each device, register and confirm both development accounts, and sign in separately. The first account creates the household and generates an invitation bound to the partner's email; the partner joins with the displayed code. The app does not send invitation mail. Confirm the account-to-person mapping and shared pantry/calendar before enabling AI. Preserve any browser recovery download before importing data.
4. Obtain the created household UUID from the development household record privately. Configure server-only `LUNCHBOX_WORKER_HOUSEHOLD_ID` and a random `LUNCHBOX_WORKER_TOKEN` of at least 32 characters in the same branch-specific Preview environment. Store that worker token privately on the Mac too. Set `LUNCHBOX_AI_MODE=ai` and redeploy; do not put either credential in chat, issue bodies, screenshots, or committed files.
5. Point the Mac's ignored `LUNCHBOX_APP_URL` at the resulting protected HTTPS preview. Follow [the worker runbook](LOCAL_AI_WORKER.md) for the tested model, exact digest, loopback Ollama and cloud-disabled setting. Stop the existing development worker before starting another one against this household. From this checkout, use the authenticated Vercel CLI to inject the preview environment and its short-lived protection token:

   ```sh
   source ./scripts/use-hackathon-tools.sh
   npx vercel@63.1.0 env run -e preview --git-branch codex/household-pilot --scope no-name-4c11 --project lunchbox -- node --conditions=react-server --import tsx scripts/local-ai-worker.ts
   ```

   The worker reads missing local model settings from ignored `.env.local`; injected preview variables take precedence. Keep `LUNCHBOX_APP_URL` current after redeploying. Re-run through the authenticated CLI when its short-lived protection token expires; retain preview protection rather than creating a bypass secret.
6. Verify both sign-ins, invitation membership, shared edits, conflict recovery, all four worker job kinds, cancellation, and worker interruption on the hosted preview. Confirm that manual planning still works with the worker stopped. Then complete [the real household run](HOUSEHOLD_PILOT_RUN.md) and record its outcome.

A localhost database and fixture demo do not satisfy hosted verification or the real household pilot. Production activation remains a separate integration action after these gates pass.
