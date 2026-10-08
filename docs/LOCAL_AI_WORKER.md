# Local AI worker

LunchBox keeps the app and household snapshot hosted. The Mac worker makes outbound authenticated requests to claim jobs, runs inference through the existing AI SDK adapter against private loopback Ollama, and submits reviewable results. The model never writes household state. The server validates returned commands and the UI applies selected changes through the same command boundary as manual controls.

## Run on the Mac

Use the repository's Node version and install the committed lockfile with `npm ci`. An Ollama instance must already be listening on a loopback address with cloud inference disabled. Do not expose Ollama to the network.

Keep these values in ignored `.env.local` or inject them into the worker process:

```dotenv
LUNCHBOX_APP_URL=https://your-protected-pilot-deployment.example
LUNCHBOX_OLLAMA_URL=http://127.0.0.1:11435
LUNCHBOX_LOCAL_MODEL=qwen3.5:27b
LUNCHBOX_LOCAL_THINKING=off
LUNCHBOX_LOCAL_MODEL_DIGEST=2d2e4b8fc7c0479b70f8cba9fc8bdb49a3c9a43a8a6da3873b724c9fca4672ef
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

No Gateway string model is used in this path. All four job types inject the local model: planning, suggestions, chat, and recipe extraction. Loopback host checks reject remote Ollama endpoints and cloud model tags. The model name is required; there is no implicit model fallback. A changed model digest fails verification until it is evaluated and deliberately repinned. Thinking is explicitly configurable as on/off and is part of the recorded inference configuration. Model errors are surfaced; no paid provider is tried.

## Planning behavior

The planning model returns an intent-specific structured draft. Clarification and discussion outputs have no action fields. References to existing recipes, batches, allocations, and people are constrained to the current snapshot. New cooking batches contain their meal allocations; existing prepared portions reference their original batch. Qualitative stock cannot contain a numeric quantity. The adapter resolves ingredient names through the canonical ingredient resolver, preserves favorite snapshots and provenance (including recipes marked make again after cooking), assigns new IDs to generated candidates, constructs shared domain operations, and validates the complete proposed result through `applyPilotCommand`.

The server supplies the authenticated member ID. The model sees opaque requester/other references, which the adapter maps back to actual members. Weekday words resolve with calendar arithmetic against the planning session; they override the selected occasion. Broad undated requests may use the visible session. Ambiguous relative dates require clarification instead of silently using the focused date.

Discussing or revising a recipe creates a candidate. An explicit request to put the focused recipe on one unambiguous occasion can apply that exact placement atomically with the saved response, a receipt, and Undo. The shared boundary verifies the unchanged focused recipe, requested date and people, one portion each, and an open occasion; the server also binds the request, actor, context revision, and returned operation to the completed worker job. Requests outside that narrow boundary, including broad plans and inventory changes, stay reviewable proposals. The model never decides whether to bypass review.

A conservative shared text guard blocks common unsupported completion claims; it is not a proof of every natural-language meaning. Only receipts demonstrate applied actions. Preferences, equipment, recent conversation with known authors, feedback, candidates, prepared food, and the calculated shopping preview are included in current context. Qualitative stock masks historical exact pantry quantities before inference; unknown amounts remain stock checks.

## Reproduce the quality gate

```sh
NODE_OPTIONS=--conditions=react-server npx tsx scripts/evaluate-local-ai.ts
```

This runs twenty representative planning scenarios twice against the actual configured local model. It writes JSON outputs and a Markdown summary under `docs/evaluations/`. The gate requires at least 90% task completion, no accepted unsupported completion claims, and no invalid state mutation. Each proposed operation must also pass the shared domain validator before the output is accepted. Failed or rejected generations count as incomplete. Latency measures the full request, including local validation and one permitted correction.

The regression check is not a human review of recipe taste or allergen safety. It checks the requested behavior and action boundaries. Accepted completion claims are counted separately from claims blocked in parsed intermediate attempts; malformed generations may fail before that attempt metadata is available. Review actual returned outputs as well as the score. To measure a different installed model, change its explicit environment settings and use a distinct `--output=report-name`; never overwrite a failed evaluation to hide it. `--limit=3 --passes=1 --output=smoke-name` is useful for quick diagnostics and cannot pass the full release gate.

The preserved initial 9B evaluation failed the gate. Under the later exact-effects-v2 checks, the frozen comparison scored 25/40 (62.5%) for 9B and 36/40 (90%) for 27B. The latter still failed both required multi-occasion batch scenarios in both repetitions and was not accepted for the pilot. The complete 27B typed/grounded baseline also failed at 34/40 (85%), with a median latency of 11.0 seconds and p95 of 25.0 seconds. Its three failures repeated in both passes: new multi-occasion batches, broad lunch batches, and qualitative stock. These reports are evidence of limitations, not authorization to enable production. Later grammar changes must be evaluated under the same scenario meanings before choosing and pinning a model.

The installed Qwen models advertise boolean thinking, not separate low/medium/high budgets. Ollama maps the OpenAI-compatible low effort value to thinking on and none to off ([Ollama compatibility documentation](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx)). After capability constraints were added, the targeted batch checks passed 4/4 with thinking off and 3/4 with thinking on; one thinking-on request exceeded the 120-second bound. These targeted checks do not replace the full twenty-scenario gate.

The [final frozen 27B evaluation](evaluations/local-ai-qwen35-27b-capability-off-final.md) passed 40/40 requests, including both required multi-occasion batch scenarios twice. It recorded zero accepted unsupported completion claims and zero invalid state changes, with two intermediate attempts rejected by the conservative wording guard. Median latency was 9.445 seconds and p95 was 20.160 seconds. The planner, claims guard, model adapter, evaluator, acceptance predicates, and fixtures had identical hashes at the start and end. Both the implementation agent and integration lead read all accepted replies and effects. This selects the model and configuration shown above: thinking off, temperature 0.2, 4,000 output tokens, and a 120-second request timeout. The final capability grammar was evaluated on 27B; the earlier 9B scores describe their preserved earlier grammar, not a new head-to-head comparison.

The score covers these twenty scenarios and their two repetitions. It does not replace protected-preview, mobile, multi-device, or real shopping-cycle verification. Clarification wording can still be imprecise: the missing-purchase-quantity replies mention packages, and one cups-to-grams refusal asks about spinach form. Neither produced a quantity or state change. Confirm supported units and actual amounts through the validated controls; the raw responses and these limitations remain in the report.
