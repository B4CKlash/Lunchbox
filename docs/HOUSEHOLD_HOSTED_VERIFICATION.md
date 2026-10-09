# Hosted development verification

Hosted setup resumed on 2026-10-09 after Supabase CLI authentication. This report covers the separate development project and protected branch preview for [draft PR #23](https://github.com/B4CKlash/Lunchbox/pull/23). It does not record real household acceptance or authorize production activation.

## Infrastructure and authentication

- The new LunchBox development Supabase project is `rnqoksszllyyixcssybd`, in `us-east-1`. Its public schema was empty before setup; there were no authentication users. The CLI dry run listed exactly the five committed migrations, `202610080001` through `202610080005`; the subsequent apply completed all five in order. No seed data or vault configuration was pushed.
- Database inspection confirmed all five migration versions, row-level security on all six application tables, and zero table grants to `anon` or `authenticated`. Application data is accessed through the server authorization boundary.
- The existing Vercel project `no-name-4c11/lunchbox` received six settings restricted to Preview and branch `codex/household-pilot`: the Supabase URL/public key, server-only service-role secret, household enablement, local-worker backend, and initial demo recipe mode. Production settings were not changed.
- Commit `47c43761033b2e522f66e26d68acc57916826183` rebuilt successfully in 54 seconds as deployment `dpl_7iuJqPtenrhttsM6Q51u3T759iE6`, [immutable preview](https://lunchbox-aqd0n9hs9-no-name-4c11.vercel.app). This is a documentation-only successor to the tested application source `51fbc42`. Its [GitHub check](https://github.com/B4CKlash/Lunchbox/actions/runs/37974262742) passed.
- Use the [stable protected branch preview](https://lunchbox-git-codex-household-pilot-no-name-4c11.vercel.app/account) for onboarding. Supabase's site URL is that origin; its redirect allowlist contains exactly the same origin's `/account` path. A minimal isolated configuration changed only these two declared properties. The follow-up diff reported no declared drift and confirmed email verification remains enabled.
- Anonymous HTTP access to the stable preview returned 302 to Vercel authentication. An authenticated deployment request without a LunchBox session reached `/api/household` and returned 401 `sign_in_required`, replacing the earlier unconfigured 503. The response used `Cache-Control: no-store`. Browser inspection showed the configured email/password sign-in controls. No deployment protection was disabled or bypass secret created.
- Private CLI credentials and ignored local evidence remain outside Git. The original local-development environment file was preserved when linking Vercel.

## Synthetic hosted household checks

Eleven groups passed against the stable protected HTTPS alias from 18:47:40 to 18:47:50 UTC. Three synthetic confirmed accounts were created through the development admin API; no email delivery was invoked. These checks used actual deployed HTTP routes, hosted authentication, and database writes.

- Unauthenticated household access returned 401. Newly signed-in accounts had no household. Owner creation returned 201, preserved an imported revision and receipt, and bound the owner to the first roster person.
- A stranger's command returned 403. Direct browser table access and creation RPC access were denied.
- Owner invitation returned 201; the wrong person's join returned 403. The intended partner joined successfully, retrying the join was safe, and the member could not issue an owner-only invitation. Each account mapped to a distinct person in the same household.
- Concurrent owner/partner edits returned one 200 and one 409 at revision 2. Retrying the accepted command returned a duplicate receipt; reusing its identifier for a different effect returned 409. Both accounts then read the same revision and state.
- The partner's Undo and exact retry both succeeded at revision 3. Database inspection found exactly two command-history entries and two mapped members.
- Cleanup deleted only the recorded synthetic household and its three users, then verified their absence. The sanitized result and private cleanup manifest are in ignored `.local/hosted-household-smoke*.json` files. The original local-only integration test guard remains unchanged.

The launch required an absolute Node path after `vercel env run`. Inspection of CLI 63.1.0 also confirmed local/process environment values override downloaded preview values; the worker runbook now makes that precedence explicit.

## Hosted app to private Mac inference

The same application source was rebuilt with a temporary worker credential scoped to one disposable development household. Deployment `dpl_Gs7zozRVjXBZNkJscoejGpkdye7Z`, [immutable worker preview](https://lunchbox-r1fiewgss-no-name-4c11.vercel.app), became Ready after 51 seconds and retained the stable protected alias. The worker connected outward with a short-lived Vercel OIDC token. Ollama 0.40.1 listened only on `127.0.0.1:11435`, with cloud inference disabled and a 16,384-token context. The tested `qwen3.5:27b` digest matched the pinned evaluation configuration; thinking remained off.

Actual worker processes handled all four job kinds. Each accepted advisory result preserved the household revision and snapshot:

| Job kind | Observed result |
| --- | --- |
| Planning | Passed in 20.296 seconds; advisory reply, no operations or unsupported completed-action claim. |
| Recipe suggestions | Passed in 67.576 seconds; three validated AI recipe candidates. |
| Legacy chat | First attempt failed visibly after 35.778 seconds. One identical targeted retry passed in 25.340 seconds, with no recipes or unsupported completed-action claim. |
| Text recipe extraction | Passed in 12.697 seconds; preserved two servings, 15 minutes, and all three supplied ingredient quantities/units. |

The first legacy-chat failure is retained, not treated as a clean first-pass success. Its public job error gave no specific cause, and the initial worker output had only been counted rather than retained; its exact failure phase is unknown. The targeted retry captured safe diagnostics (`ok`, finalization, two steps, stop/stop). No application fix or root cause is claimed. The existing local chat smoke also needed a retry, so this remains a reliability limitation to observe during the pilot. Recipe generation was materially slower than a short planning reply.

Separate deterministic transport checks renewed a lease, cancelled a job from the partner account, rejected late completion, reclaimed an expired lease with new ownership, rejected the old owner, deduplicated identical completion, rejected changed-result reuse and invalid proposed operations, and discarded an old-context result as stale. Manual partner edits synchronized, stale commands conflicted, retries deduplicated, and manual editing remained available when worker presence was marked offline. Lease/presence expiry was simulated only on the exact synthetic rows; this is distinct from the four actual model runs.

Evidence is in ignored `.local/hosted-worker-proof.json` and its preserved prior-run JSON. Synthetic admin confirmation does not verify real signup email delivery, and these checks do not replace two real devices or the actual shopping/cooking cycle.

## Hosted browser persistence

The integration lead signed into the protected preview with the synthetic owner, opened `/meals`, selected Local AI, and requested a quick vegetable-focused lunch candidate without changing the calendar. The actual Mac worker completed the request in 31.873 seconds on its first attempt. The UI displayed a Mediterranean Lentil and Zucchini Bowl and “Response saved to this session.” Reload restored the conversation/card and returned to “Household synced.”

Post-browser database inspection confirmed revision 3, one persisted candidate, the user and assistant messages, zero batches/allocations, and pantry identical to the synthetic seed. The result contained zero calendar operations. The evidence is in ignored `.local/hosted-ui-persistence-proof.json` and `.local/hosted-planning-response.png`. The test account was signed out and the temporary resident worker stopped gracefully afterward.

Cleanup then removed the exact temporary household and its two accounts. Verification found zero associated rows across all six application tables, both users returned 404, and the launcher/worker processes were stopped. The two temporary worker settings were removed from the branch environment and recipe mode returned to `demo` for the next deployment. The hosted database/authentication settings remain configured. A real worker must be scoped to the real development household after onboarding; the temporary test binding is not a usable household setup.

## Remaining household onboarding

Supabase dashboard login establishes administrative access; it does not create a LunchBox household account. Each participant needs their own LunchBox account and access to the protected preview. The owner creates the household; the partner joins it using the email-bound invitation code.

Supabase's [default email service](https://supabase.com/docs/guides/auth/auth-smtp) restricts delivery to project-team addresses. Confirmed signup for both real participants requires an appropriate email delivery configuration. No real signup, invitation message, or confirmation email was sent during infrastructure setup.

After email delivery and both accounts are ready, bind the Mac worker to the actual development household and run the two-device checks and [real planning/shopping/cooking cycle](HOUSEHOLD_PILOT_RUN.md). Synthetic checks do not complete those gates.
