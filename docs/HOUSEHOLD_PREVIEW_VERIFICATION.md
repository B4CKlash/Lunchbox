# Protected preview verification

Verified on 2026-10-08 for draft [PR #23](https://github.com/B4CKlash/Lunchbox/pull/23). These checks cover commit `c03ceec59b123ae5ff6e3c607e7c388040a1f334` and its [canonical project preview](https://lunchbox-1cvdj41ew-no-name-4c11.vercel.app). Later changes require a new preview check.

## CI and deployment

- GitHub Actions passed dependency installation, `npm run check`, and `npm run build` in [the PR check run](https://github.com/B4CKlash/Lunchbox/actions/runs/37835979512).
- The existing `no-name-4c11/lunchbox` project produced a Ready preview; reported build duration was 34 seconds. No deployment was promoted or production environment changed.
- Read-only project inspection confirmed `ssoProtection.deploymentType = all_except_custom_domains`. One unauthenticated request to `/meals` returned HTTP 302 to Vercel sign-in. Authenticated `vercel curl` reached the application. No protection setting or bypass secret was changed.

## HTTP behavior

- Authenticated requests to `/meals`, `/recipes`, `/pantry`, `/shopping`, and `/account` returned HTTP 200 on the initial `2cea5eb` preview. The refreshed `c03ceec` `/recipes` response returned HTTP 200 and serialized `aiMode: demo`, confirming the branch-specific fixture setting is present.
- A valid `/api/meals/suggest` POST on the refreshed preview returned HTTP 200, `source: demo`, and three recipes. No local model or paid provider was invoked for this fixture request.
- `/api/household` and `/api/household/jobs` on the initial preview returned HTTP 503 with `household_unconfigured`. `/api/household/commands` on the refreshed preview did the same. `/api/household/jobs/worker` returned HTTP 503 with `worker_unconfigured`. These are intentional configuration failures: no hosted development database or worker credential is enabled.
- API responses use `Cache-Control: no-store` and JSON content types. Preview responses include `X-Robots-Tag: noindex` and HTTPS Strict Transport Security.
- Raw responses and headers are retained only in ignored `.local/` files; authentication tokens and cookies are not included in this report.

## Remaining acceptance

HTTP route checks do not prove browser interactions or hosted household authorization. The local integration suite separately proves real sign-in, membership, invitation, concurrent-edit and worker lease behavior. A separate hosted development Supabase project and authenticated worker must be configured before proving those flows on a protected preview. Production activation and the real household shopping/cooking cycle remain release gates.
