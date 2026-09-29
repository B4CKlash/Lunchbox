# User accounts setup and handoff

Branch: `codex/user-accounts`. This change adds `/account`, email/password signup and sign-in, profile name editing, local sign-out, and explicit account kitchen snapshots. It uses the official Supabase browser client with database row-level security. There is no custom password database or service-role credential.

## Connect a real project

1. Create or reuse a Supabase project with your integration lead. Enable email/password authentication and keep email confirmation enabled.
2. Run `supabase/accounts.sql` in the project's SQL editor. This creates an account-owned kitchen table with select/insert/update policies restricted to `auth.uid()`. Do not expose the table without these policies.
3. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project settings. These two values are public by design. Never use a secret or service-role key in this app.
4. In Supabase Auth URL configuration, set the site URL to the canonical production app and allow `http://localhost:3000/account` and `https://lunchbox-snowy.vercel.app/account` as redirect URLs. Add explicitly approved preview origins when testing previews.
5. Configure confirmation email delivery/SMTP and auth rate limits for production. Sign up, confirm the email, then sign in. The SDK handles the returned browser session; no server callback is needed for this client-only flow.
6. Have the integration lead add the same public settings to the existing Vercel project and rebuild. The app remains usable in browser-local mode without configuration.

## User behavior

The current pantry, preferences, meals, recipe box, and conversation still use the original household provider and local-storage adapter. Signing in does not automatically import or replace that kitchen. The account screen lets a user explicitly save the whole browser kitchen to their account or load the account snapshot into the browser after confirmation. A missing or invalid cloud snapshot never clears local data.

Snapshots are manual, not automatic synchronization or collaborative households. Saving replaces the prior cloud snapshot; loading replaces the current browser snapshot. The UI explains these actions. Local sign-out resets the browser kitchen to sample data after confirmation. Browser data is not encrypted or user-scoped, so this is not a shared-device privacy solution. A future integration should scope the storage adapter by account and clear account data on every session change, including other tabs.

Only the account route observes auth state. Pantry and meals remain available to guests. Any future protected server endpoint must independently authenticate the request; client UI state is not authorization. Cloud access is enforced in Postgres by RLS.

## Coordination

The cross-owner edits are limited to an account navigation entry, account route, a `replaceHousehold` action (which invalidates old chat requests), scoped account CSS, and the Supabase dependency. Shared household contracts, pantry calculations, meal logic, existing storage format, and deployment settings are preserved. Integration lead should review the route/dependency; frontend and storage owners should review the snapshot controls.

## Verification before merge

Run `npm run check` and `npm run build`. With a configured project:

- Sign up and confirm an email. Try an incorrect password, a valid password, reload, and sign out.
- Edit the display name and confirm it persists after sign-in.
- Save a modified pantry with a planned meal and recipe workspace, then load it in a second browser signed into the same account.
- Check that an account with no saved kitchen leaves its local state intact.
- Use two real accounts and verify account B cannot select or upsert account A's row through Supabase (RLS test).
- Confirm that failed network requests display errors without replacing local kitchen data.
- Verify pantry → meals → shopping and mobile account layout.

Password recovery, email changes, account deletion, automatic sync, household invitations, and conflict resolution are future work. Provider integration and RLS need live verification before production use; local mock tests only cover adapter behavior.
