# Private household account invitations

For this small protected development pilot, the operator can generate individual account invitation links and hand each one privately to its intended person. This creates an unconfirmed Supabase account and lets the recipient choose their own password on `/account`. It does not require SMTP, send an email, disable email confirmation, create household membership, or enable the AI worker.

The script calls only `auth.admin.generateLink({ type: "invite" })`. It does not call `inviteUserByEmail`, which sends mail. Supabase documents [link generation](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) separately from [email invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

## Prepare the private input

Use the repository's Node toolchain and installed lockfile dependencies. The ignored `.local/hosted-preview-values.json` must already contain `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` for the selected development project. Keep it owner-only (`chmod 600`). The script reads this file only when explicitly invoked with `--run`; it does not load `.env.local` or accept environment variables that could select a different database.

Before generating links, deploy the password-setup account screen, set the development Supabase site URL to the protected preview origin, and allow its exact `/account` redirect. Each person needs access to the protected Vercel preview in the browser where they will open their invitation. A scoped, expiring branch share link can supply that access without a Vercel account or email invitation. Sign out of any other LunchBox account first.

Create an owner-only JSON file under ignored `.local/`, for example `.local/manual-invites-input.json`:

```json
{
  "projectRef": "YOUR_DEVELOPMENT_PROJECT_REF",
  "appOrigin": "https://YOUR_PROTECTED_PREVIEW.vercel.app",
  "accounts": [
    { "email": "person-one@example.com", "displayName": "Person one" },
    { "email": "person-two@example.com", "displayName": "Person two" }
  ]
}
```

Replace the example values privately; never commit the completed input. Do not put email addresses or service keys in shell arguments. The app value is an HTTPS origin, without a path, query, or fragment. The script derives `/account` itself and refuses the canonical production demo origin. The requested project reference must match the private credential file.

## Validate, then generate

```sh
source scripts/use-hackathon-tools.sh
chmod 600 .local/manual-invites-input.json
node --import tsx scripts/manual-account-invites.ts \
  --input=.local/manual-invites-input.json \
  --output=.local/manual-invite-links.json
```

Without `--run`, this validates the input only: no credentials are read and no account is created. When the exact recipient list and development destination are ready:

```sh
node --import tsx scripts/manual-account-invites.ts \
  --input=.local/manual-invites-input.json \
  --output=.local/manual-invite-links.json \
  --run
```

Generation lists existing users before creating any account. Duplicate addresses and existing users are refused unless an exact pending-account reissue is explicitly requested below. Output is reserved exclusively, saved with mode `0600`, and updated after each completed link. An existing output file is never overwritten. The terminal prints counts and fixed status messages only—not email addresses, links, tokens, keys, or raw service errors.

Open the output privately and give each person only their own `completed[].inviteLink`. This opens the app's `/account` page with the one-time invitation token in the URL fragment, which is not sent in HTTP requests. The page clears that fragment from browser history and waits for the recipient to select **Accept invitation** before verifying it. The recipient then chooses and confirms a password. The operator may add a legitimate, separately authorized Vercel share query before the `#` when arranging protected preview access; the script does not create or change deployment protection.

The private output also retains Supabase's official `actionLink` for a reviewed fallback. Opening that link consumes the invitation before returning to the app, so use the app-local `inviteLink` when preview access must be completed first. Do not post either link or the output file in a pull request, issue, shared screenshot, or application log. The account metadata is `display_name` plus `needs_password_setup: true`; successful password setup clears the latter. This metadata controls the setup screen, not authorization.

One person creates the household. The other joins using the separate email-bound household invitation code from the app. These account links do not join or merge households. Alternatively, an authorized operator may preprovision one empty household against exact newly invited account IDs and stable roster IDs. Verify both mappings, never move existing memberships, and preserve local browser recovery data; this was used for the initial two participants.

## Expiry, reissue, and interrupted runs

Invitation lifetime follows the project's **Email OTP Expiration** setting. Supabase's documented default is one hour, but the script does not assume the configured value or invent an `expiresAt` timestamp. Check the project setting and create links shortly before recipients are ready. An expired or already used link can show a fixed error on `/account`. See Supabase's [invitation and expiration guidance](https://supabase.com/docs/guides/auth/users).

For an expired, still-unconfirmed invitation, review its user ID in the private previous output or Supabase dashboard. Make a new private input containing only that person and the exact `reissueUserId`:

```json
{
  "projectRef": "YOUR_DEVELOPMENT_PROJECT_REF",
  "appOrigin": "https://YOUR_PROTECTED_PREVIEW.vercel.app",
  "accounts": [
    {
      "email": "person-one@example.com",
      "displayName": "Person one",
      "reissueUserId": "EXACT_EXISTING_USER_UUID"
    }
  ]
}
```

Use a new output filename. Reissue requires the same email and UUID, `needs_password_setup: true`, no email confirmation, and no previous sign-in. Send only the newest link and discard the earlier one. Confirmed or previously signed-in users must use their normal sign-in or a separately reviewed account-recovery flow; this script will not reset their account or replace their password.

If generation stops halfway, the private output preserves links already completed and a sanitized failure. Do not rerun the original batch blindly. Review `completed` and `failedAccountNumber`; a request with an unknown outcome may have created an account even if its link was not returned. Inspect that exact account before deciding whether a pending invite reissue is appropriate. Never delete accounts to work around the existing-user guard.

After each person successfully signs in with their own password, remove their consumed action link from local operator storage when no longer needed. Keep account IDs or non-secret setup evidence separately if needed. No service credentials or one-time links belong in committed documentation.

## Verification

```sh
node --conditions=react-server --import tsx --test src/features/accounts/manual-invites.test.ts
```

These tests use fake administrative responses and temporary private files; they create no hosted accounts. They cover duplicate recipients, redirect validation, pagination, existing-account refusal, exact pending-invite reissue, partial failures, and output permissions. Before real invitations are generated, separately verify synthetic invitation acceptance and the password setup screen in the protected browser, plus password update/sign-out/subsequent sign-in through the hosted authentication API. Each real participant enters and submits their own password. See [the executed proof](HOUSEHOLD_HOSTED_VERIFICATION.md#manual-account-invitation-verification--2026-10-09).
