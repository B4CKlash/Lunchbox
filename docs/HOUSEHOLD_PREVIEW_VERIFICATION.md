# Protected preview verification

Verified on 2026-10-08 for draft [PR #23](https://github.com/B4CKlash/Lunchbox/pull/23). These checks cover commit `8b24f48794d7b5423665cb8ec618433e28ae99e0` and its [canonical project preview](https://lunchbox-7y6vpzfe1-no-name-4c11.vercel.app), deployment `dpl_DzTzWM3NBaZAHkaYNFnakRgJroiX`. Vercel deployment metadata identifies this exact Git SHA and branch `codex/household-pilot`. Later source changes require a new preview check.

## CI and deployment

- GitHub Actions passed dependency installation, `npm run check`, and `npm run build` in [the exact-commit PR check run](https://github.com/B4CKlash/Lunchbox/actions/runs/37844409190).
- The existing `no-name-4c11/lunchbox` project produced a Ready preview; reported build duration was 49 seconds. All listed PR checks passed, including the canonical Vercel check and the separate `lunchbox-9ezx` deployment check. That other project's HTTP behavior is outside this canonical-preview verification, and it was not changed. No deployment was promoted or production environment changed.
- Read-only project inspection confirmed `ssoProtection.deploymentType = all_except_custom_domains`. One unauthenticated request to `/meals` returned HTTP 302 to Vercel sign-in. Authenticated `vercel curl` reached the application. No protection setting or bypass secret was changed.

## HTTP behavior

- Authenticated requests to `/meals`, `/recipes`, `/pantry`, `/shopping`, and `/account` each returned HTTP 200 on this exact preview. The `/recipes` response serialized `aiMode: demo`, confirming the branch-specific fixture setting is present.
- A valid `/api/meals/suggest` POST returned HTTP 200, `source: demo`, and three recipes. No local model or paid provider was invoked for this fixture request.
- `/api/household` and `/api/household/jobs` GET requests and `/api/household/commands` POST returned HTTP 503 with `household_unconfigured`. `/api/household/jobs/worker` POST returned HTTP 503 with `worker_unconfigured`. These are intentional configuration failures: no hosted development database or worker credential is enabled. They demonstrate fail-closed configuration behavior, not hosted household membership verification.
- API responses use `Cache-Control: no-store` and JSON content types. Preview responses include `X-Robots-Tag: noindex` and HTTPS Strict Transport Security.
- Raw responses and headers are retained only in ignored `.local/` files; authentication tokens and cookies are not included in this report.

## Earlier preview history

The earlier `2cea5eb` preview passed the five authenticated page checks. Commit `c03ceec59b123ae5ff6e3c607e7c388040a1f334` was then verified at [its canonical preview](https://lunchbox-1cvdj41ew-no-name-4c11.vercel.app), with [CI passing](https://github.com/B4CKlash/Lunchbox/actions/runs/37835979512), a 34-second Ready build, the same protection configuration, demo suggestions, and unconfigured shared/worker endpoints. The current `8b24f4` checks above supersede that HTTP evidence for the final implementation.

## Remaining acceptance

Browser interaction evidence for this preview is recorded separately in [the browser verification report](HOUSEHOLD_BROWSER_VERIFICATION.md). HTTP route checks do not prove those interactions or hosted household authorization. The local integration suite separately proves real sign-in, membership, invitation, concurrent-edit and worker lease behavior. A separate hosted development Supabase project and authenticated worker must be configured before proving those flows on a protected preview. Production activation and the real household shopping/cooking cycle remain release gates.
