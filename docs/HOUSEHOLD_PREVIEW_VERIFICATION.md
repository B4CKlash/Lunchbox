# Protected preview verification

Verified on 2026-10-08 for draft [PR #23](https://github.com/B4CKlash/Lunchbox/pull/23). These checks cover commit `51fbc42e008564a999ec4d7f7c8cccf61340b84b` and its [canonical project preview](https://lunchbox-h4dl7she7-no-name-4c11.vercel.app), deployment `dpl_CGMR1J9MDtBQ1XbxTEnprrHLVTxG`. Vercel deployment metadata identifies this exact Git SHA and branch `codex/household-pilot`. This source includes candidate grocery previews, purchase history, prepared-food corrections, recipe rejection, and the mobile candidate-panel fix. Later source changes require a new preview check.

## CI and deployment

- GitHub Actions passed dependency installation, `npm run check`, and `npm run build` in [the exact-commit PR check run](https://github.com/B4CKlash/Lunchbox/actions/runs/37848264277).
- The existing `no-name-4c11/lunchbox` project produced a Ready preview; deployment timestamps show a 64.2-second build. All listed PR checks passed, including the canonical Vercel check and the separate `lunchbox-9ezx` deployment check. That other project's HTTP behavior is outside this canonical-preview verification, and it was not changed. No deployment was promoted or production environment changed.
- Read-only project inspection confirmed `ssoProtection.deploymentType = all_except_custom_domains`. One unauthenticated request to `/meals` returned HTTP 302 to Vercel sign-in. Authenticated `vercel curl` reached the application. No protection setting or bypass secret was changed.

## HTTP behavior

- Authenticated requests to `/meals`, `/recipes`, `/pantry`, `/shopping`, and `/account` each returned HTTP 200 on this exact preview. The `/recipes` response serialized `aiMode: demo`, confirming the branch-specific fixture setting is present.
- A valid `/api/meals/suggest` POST returned HTTP 200, `source: demo`, and three recipes. No local model or paid provider was invoked for this fixture request.
- `/api/household` and `/api/household/jobs` GET requests and `/api/household/commands` POST returned HTTP 503 with `household_unconfigured`. `/api/household/jobs/worker` POST returned HTTP 503 with `worker_unconfigured`. These are intentional configuration failures: no hosted development database or worker credential is enabled. They demonstrate fail-closed configuration behavior, not hosted household membership verification.
- API responses use `Cache-Control: no-store` and JSON content types. Preview responses include `X-Robots-Tag: noindex` and HTTPS Strict Transport Security.
- Raw responses and headers are retained only in ignored `.local/preview-51f-*` files. The sanitized `.local/preview-51f-http-summary.json` records statuses, error codes, and Vercel request IDs; `.local/preview-51f-ci.json` and `.local/preview-51f-deployment.json` retain the matching run/deployment evidence. Authentication tokens and cookies are not included in this report.

## Earlier preview history

The earlier `2cea5eb` preview passed the five authenticated page checks. Commit `c03ceec59b123ae5ff6e3c607e7c388040a1f334` was then verified at [its canonical preview](https://lunchbox-1cvdj41ew-no-name-4c11.vercel.app), with [CI passing](https://github.com/B4CKlash/Lunchbox/actions/runs/37835979512), a 34-second Ready build, the same protection configuration, demo suggestions, and unconfigured shared/worker endpoints.

Commit `8b24f48794d7b5423665cb8ec618433e28ae99e0` passed the same HTTP checks at [its canonical preview](https://lunchbox-7y6vpzfe1-no-name-4c11.vercel.app), deployment `dpl_DzTzWM3NBaZAHkaYNFnakRgJroiX`, with [CI passing](https://github.com/B4CKlash/Lunchbox/actions/runs/37844409190) and a 49-second Ready build. The current `51fbc42` checks above supersede those earlier HTTP checks for the final implementation.

## Remaining acceptance

Browser interaction evidence for this preview is recorded separately in [the browser verification report](HOUSEHOLD_BROWSER_VERIFICATION.md). HTTP route checks do not prove those interactions or hosted household authorization. The local integration suite separately proves real sign-in, membership, invitation, concurrent-edit and worker lease behavior. A separate hosted development Supabase project and authenticated worker must be configured before proving those flows on a protected preview. Production activation and the real household shopping/cooking cycle remain release gates.

## Browser checks on source 51fbc42

The integration lead exercised the deployed application in an authenticated in-app browser at desktop and 390 × 844 mobile widths. This preview used clearly labeled fixtures and browser-local test inventory; it did not establish hosted household authorization or a real shopping cycle.

- Marked only You's Tuesday lunch covered, leaving Partner open. Reviewed a six-placement pasta proposal, excluded Friday lunch for both people, and applied four placements. The single four-portion batch needed 360 g pasta. Before placement, its two-portion candidate preview showed an additional 180 g without changing live groceries.
- Recorded a 500 g pasta purchase with purchased-on October 8, 2026, best-before October 8, 2027, source `Protected preview test`, and lot `PREVIEW-51F`. Cooked six actual portions, reserving two for the freezer, and marked You's October 8 lunch eaten.
- Saved four-star make-again feedback, then corrected production to seven portions, freezer balance to three, and reopened the mistakenly eaten lunch. Reload retained seven remaining, three frozen, three unallocated, and all four uneaten allocations. Pasta stock remained 140 g; historical purchase amount remained 500 g with its original dates and source. The correction did not refund the recorded 360 g ingredient use.
- Created four fixture candidates through effort/cuisine/vegetable exploration. Rejected the focused vegetable skillet and reloaded: it was absent from current focus/cards, while its historical entry offered explicit Reconsider. That action restored it.
- Selected October 13 dinner: the restored two-portion skillet preview showed additional 100 g tomatoes, one zucchini, and one pepper against current stock; no new batch was placed. Live groceries remained empty and the saved horizon remained October 14.
- At 390 × 844, the four-candidate focused panel, placement controls, and candidate grocery preview fit the page. Client width and scroll width were both 375 px; recipe choices scrolled within their own panel. Screenshot retained at ignored `.local/protected-preview-51f-mobile.png`. The temporary viewport override was reset after verification.

The earlier local two-device checks separately proved correction conflicts and the one-job real local AI rejection refresh. Their evidence remains in [the delivery tracker](HOUSEHOLD_PILOT_DELIVERY.md); fixture preview checks do not substitute for those or the pending hosted household cycle.
