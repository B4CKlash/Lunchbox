# Local AI worker

LunchBox keeps the app and household snapshot hosted. The Mac worker makes outbound authenticated requests to claim jobs, runs inference through the existing AI SDK adapter against private loopback Ollama, and submits reviewable results. The model never writes household state. The server validates returned commands and the UI applies selected changes through the same command boundary as manual controls.

## Run on the Mac

Use the repository's Node version and install the committed lockfile with `npm ci`. An Ollama instance must already be listening on a loopback address with cloud inference disabled. Do not expose Ollama to the network.

Keep these values in ignored `.env.local` or inject them into the worker process:

```dotenv
LUNCHBOX_APP_URL=https://your-protected-pilot-deployment.example
LUNCHBOX_OLLAMA_URL=http://127.0.0.1:11435
LUNCHBOX_LOCAL_MODEL=qwen3.5:9b
LUNCHBOX_LOCAL_MODEL_DIGEST=<digest recorded in the evaluation report>
LUNCHBOX_WORKER_TOKEN=<same household-scoped worker secret configured on the server>
```

Protected Vercel previews additionally accept the short-lived `VERCEL_OIDC_TOKEN` injected by the authenticated Vercel CLI (`vercel env run`). The worker sends it as `x-vercel-trusted-oidc-idp-token` only to the configured HTTPS app origin, never to Ollama or loopback HTTP. Refresh it through the authenticated CLI when it expires. Do not save a long-lived deployment-protection bypass or disable preview protection. Credentials are never logged.

The server also requires `LUNCHBOX_WORKER_HOUSEHOLD_ID` and its normal server-authorized Supabase configuration. The server chooses the worker's household; the worker cannot select another household in a request. Use a separate development database for local work.

```sh
source ./scripts/use-hackathon-tools.sh
NODE_OPTIONS=--conditions=react-server npx tsx scripts/local-ai-worker.ts
```

For local app verification, set `LUNCHBOX_APP_URL=http://127.0.0.1:3000` (or the actual development port). Only HTTPS and loopback HTTP app origins are accepted. The worker refuses redirects to avoid forwarding its credential to another origin. The `--once` flag claims at most one job, processes it, and exits; an empty queue also exits.

The worker polls every five seconds while idle. A running job renews its lease every twenty seconds. Cancellation, a lost lease, or a failed heartbeat aborts generation. A process interruption leaves an expiring lease so the server can requeue the job. Completion retries reuse the same job and lease token; the server rejects obsolete completion and discards results whose household revision changed. Ctrl+C or SIGTERM stops the worker.

No Gateway string model is used in this path. All four job types inject the local model: planning, suggestions, chat, and recipe extraction. Loopback host checks reject remote Ollama endpoints and cloud model tags. A changed model digest fails verification until it is evaluated and deliberately repinned. Model errors are surfaced; no paid provider is tried.

## Planning behavior

The planning model returns a small structured draft. The adapter resolves ingredient names through the canonical ingredient resolver, preserves favorite snapshots and provenance, assigns new IDs to generated candidates, constructs shared domain operations, and validates the complete proposed result through `applyPilotCommand`. Individual coverage, combined batch quantities, prepared portion limits, and stale revisions therefore use exactly the manual-control rules.

The output is advisory. Recipes stay candidates, and actions stay reviewable proposals until the user accepts them. Completed-action claims in accepted assistant prose are rejected; only receipts demonstrate applied actions. Preferences, equipment, recent conversation, feedback, candidates, prepared food, and the calculated shopping preview are included in current context. Unknown pantry quantities remain stock checks.

## Reproduce the quality gate

```sh
NODE_OPTIONS=--conditions=react-server npx tsx scripts/evaluate-local-ai.ts
```

This runs twenty representative planning scenarios twice against the actual configured local model. It writes JSON outputs and a Markdown summary under `docs/evaluations/`. The gate requires at least 90% task completion, no accepted unsupported completion claims, and no invalid state mutation. Each proposed operation must also pass the shared domain validator before the output is accepted. Failed or rejected generations count as incomplete. Latency measures the full request, including local validation and one permitted correction.

The regression check is not a human review of recipe taste or allergen safety. It checks the requested behavior and action boundaries. To measure a different installed model, change its explicit environment settings and use a distinct `--output=report-name`; never overwrite a failed evaluation to hide it. `--limit=3 --passes=1 --output=smoke-name` is useful for quick diagnostics and cannot pass the full release gate.
