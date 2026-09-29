# Account sign-in setup

This feature adds only an account navigation tab and `/account` with Supabase email/password signup, sign-in, profile name editing, and sign-out. Account styles use a CSS module. Pantry, meal planning, shopping, shared household state, and browser storage are unchanged. Signing in or out does not change kitchen data. Kitchen data remains local to the browser; cloud synchronization is outside this feature.

1. Create or reuse a Supabase project. Enable email/password authentication and email confirmation.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` and the existing Vercel project. Use only the public publishable key, never a secret or service-role key.
3. Configure the Supabase site URL and allow the local and production `/account` redirect URLs. Configure email delivery for confirmation messages.
4. Rebuild the app. Without configuration, the account page displays an unavailable message.
5. Test signup, email confirmation, sign-in, profile editing, reload, and sign-out with real credentials. Confirm pantry and shopping data stay unchanged.

Verification: `npm run check` and `npm run build`. Provider flows require a configured Supabase project. Password recovery, account deletion, household invitations, and cloud persistence are future work.
