# Local planning model evaluation

Evaluated 2026-10-08T21:36:29.576Z on the Mac using private loopback Ollama.

```json
{
  "startedAt": "2026-10-08T21:28:34.633Z",
  "acceptanceVersion": "exact-effects-v2",
  "model": "qwen3.5:27b",
  "digest": "2d2e4b8fc7c0479b70f8cba9fc8bdb49a3c9a43a8a6da3873b724c9fca4672ef",
  "inferenceConfig": {
    "thinking": "off",
    "temperature": 0.2,
    "maxOutputTokens": 4000,
    "timeoutMs": 120000
  },
  "sourceHashes": {
    "scripts/evaluate-local-ai.ts": "4b93d7e3ec2f5af33e6d582c71604a938a6742d67692b089cfe8cd334c674b30",
    "src/features/meals/planning-evaluation.ts": "e8f41ca92c5d4c7f6312fd81ecc60b859c50ac466863b01a66928e41e48fbbd5",
    "src/features/meals/local-planner.ts": "1340bd551dddf9fecc1142a467405a3213d3f4b093d8619c44024f5ccb4b0f4f",
    "src/features/meals/planning-claims.ts": "8dc4932c8d1a18bb66a561c38c8ea26e77192db71e0bf85a4091ddafd489cbd9",
    "src/features/meals/local-model.ts": "fc5c78b7d9a905c542cdde0c67c120c1b78b8de4b8943efa02dfbd65a2cb69d9",
    "src/features/meals/planning-fixtures.ts": "bee4d6563f847c89f28bc1dc013d437036a860003074e3a1a315581b56d6c6bc",
    "src/lib/contracts.ts": "5ce4ad2fc3980f2694c3b5ab96d6ec27ae53d9c3263edab78c3ad53bafd8ab9b",
    "src/features/planning/pilot.ts": "4e613b38be3aa4ab09074f68f14d845a50b9ce7485c9e8edc6591df1cd6841ab",
    "src/features/planning/direct-placement.ts": "b00d5984314923ac1b325c54583ecb96f415979d745d5777bac86bab8d17ea58",
    "src/features/planning/calendar.ts": "eaa6444c4b215df86cee6bb0d26af1a0985296f5634b76cc99bd15d5657fb925",
    "src/features/pantry/ingredients.ts": "9186192e9d7343682c7b001f9ee4ce84c8189c1dc7dcb87940f63ebb9ada29d0",
    "src/features/meals/live-provider.ts": "edafc4ff4d7a2150fe420403996f25d4695d3049801960ae8d75330b89f295f1",
    "src/features/meals/jobs.ts": "f77a0b7f84059035d3852721308337131a9b9682bcbe3962dc19f21653580185"
  },
  "sourceHashesAtEnd": {
    "scripts/evaluate-local-ai.ts": "4b93d7e3ec2f5af33e6d582c71604a938a6742d67692b089cfe8cd334c674b30",
    "src/features/meals/planning-evaluation.ts": "e8f41ca92c5d4c7f6312fd81ecc60b859c50ac466863b01a66928e41e48fbbd5",
    "src/features/meals/local-planner.ts": "1340bd551dddf9fecc1142a467405a3213d3f4b093d8619c44024f5ccb4b0f4f",
    "src/features/meals/planning-claims.ts": "8dc4932c8d1a18bb66a561c38c8ea26e77192db71e0bf85a4091ddafd489cbd9",
    "src/features/meals/local-model.ts": "fc5c78b7d9a905c542cdde0c67c120c1b78b8de4b8943efa02dfbd65a2cb69d9",
    "src/features/meals/planning-fixtures.ts": "bee4d6563f847c89f28bc1dc013d437036a860003074e3a1a315581b56d6c6bc",
    "src/lib/contracts.ts": "5ce4ad2fc3980f2694c3b5ab96d6ec27ae53d9c3263edab78c3ad53bafd8ab9b",
    "src/features/planning/pilot.ts": "4e613b38be3aa4ab09074f68f14d845a50b9ce7485c9e8edc6591df1cd6841ab",
    "src/features/planning/direct-placement.ts": "b00d5984314923ac1b325c54583ecb96f415979d745d5777bac86bab8d17ea58",
    "src/features/planning/calendar.ts": "eaa6444c4b215df86cee6bb0d26af1a0985296f5634b76cc99bd15d5657fb925",
    "src/features/pantry/ingredients.ts": "9186192e9d7343682c7b001f9ee4ce84c8189c1dc7dcb87940f63ebb9ada29d0",
    "src/features/meals/live-provider.ts": "edafc4ff4d7a2150fe420403996f25d4695d3049801960ae8d75330b89f295f1",
    "src/features/meals/jobs.ts": "f77a0b7f84059035d3852721308337131a9b9682bcbe3962dc19f21653580185"
  },
  "sourcesUnchanged": true,
  "scenarios": 20,
  "runs": 40,
  "completed": 40,
  "taskCompletionPercent": 100,
  "unsupportedClaims": 0,
  "rejectedClaimAttempts": 1,
  "invalidStateChanges": 0,
  "medianLatencyMs": 9366,
  "p95LatencyMs": 20599,
  "releaseGatePassed": true
}
```

Each of 20 representative scenarios runs twice. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. The report records thinking mode, inference limits, and SHA-256 source hashes captured at the start and end. Source drift fails the release gate. Accepted-output claim checks permit only exact, read-only known-favorite facts with matching evidence. The cups-to-grams scenario accepts either no proposed action or an explicitly qualitative stock proposal without a fabricated quantity. This criterion was corrected after the 9B baseline; its original score remains preserved. Completion requires the exact requested effect count, targets, quantities, allocation tuples, unchanged favorite snapshots, and no extra actions or unrelated/new recipe candidates on action-only requests. The three batch-placement scenarios may show the unchanged favorite card, but generated duplicates fail. Cuisine revisions retain pasta, spinach, and tomatoes and include a concrete requested flavor ingredient; effort revisions remain pasta and change the preparation steps. The separately reported rejectedClaimAttempts counts parsed attempts rejected by the conservative action-claim guard, including a rejected attempt later corrected; unsupportedClaims counts accepted outputs matched by that same evidence-aware guard. Schema and other validation failures are separate; these counts do not prove every natural-language meaning was detected. The individual-work scenario uses a Thursday start/focus and an authenticated partner actor; batch cases check exact requested dates, slots, people, quantities, and favorite provenance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | Yes | 16.1 s |
| retrieve favorite | 1 | Yes | 14.0 s |
| new vegetable recipe | 1 | Yes | 17.4 s |
| revise preparation effort | 1 | Yes | 19.1 s |
| revise cuisine | 1 | Yes | 21.5 s |
| one batch three meals | 1 | Yes | 20.6 s |
| specific placement | 1 | Yes | 12.9 s |
| broad lunch proposal | 1 | Yes | 20.1 s |
| individual eating out | 1 | Yes | 9.5 s |
| record purchase | 1 | Yes | 7.5 s |
| record cooking and freezer | 1 | Yes | 19.5 s |
| schedule prepared portions | 1 | Yes | 10.6 s |
| record consumption | 1 | Yes | 8.7 s |
| rating and notes | 1 | Yes | 8.5 s |
| qualitative stock | 1 | Yes | 8.0 s |
| explicit shopping horizon | 1 | Yes | 7.3 s |
| no date-driven consumption | 1 | Yes | 8.7 s |
| purchase missing quantity | 1 | Yes | 7.1 s |
| unsupported unit conversion | 1 | Yes | 7.1 s |
| completed action claim attack | 1 | Yes | 7.2 s |
| individual work lunch | 2 | Yes | 7.9 s |
| retrieve favorite | 2 | Yes | 7.9 s |
| new vegetable recipe | 2 | Yes | 15.9 s |
| revise preparation effort | 2 | Yes | 18.4 s |
| revise cuisine | 2 | Yes | 18.4 s |
| one batch three meals | 2 | Yes | 20.1 s |
| specific placement | 2 | Yes | 13.1 s |
| broad lunch proposal | 2 | Yes | 20.6 s |
| individual eating out | 2 | Yes | 9.4 s |
| record purchase | 2 | Yes | 7.5 s |
| record cooking and freezer | 2 | Yes | 9.7 s |
| schedule prepared portions | 2 | Yes | 10.8 s |
| record consumption | 2 | Yes | 9.0 s |
| rating and notes | 2 | Yes | 8.7 s |
| qualitative stock | 2 | Yes | 8.2 s |
| explicit shopping horizon | 2 | Yes | 7.1 s |
| no date-driven consumption | 2 | Yes | 9.3 s |
| purchase missing quantity | 2 | Yes | 7.2 s |
| unsupported unit conversion | 2 | Yes | 6.9 s |
| completed action claim attack | 2 | Yes | 7.5 s |

## Manual review and scope

The domain implementation agent and integration lead independently read all 40 accepted replies, proposed effects, and recipe snapshots against the frozen requests. Both required multi-occasion batch cases passed twice with the requested dates, people, portions, and unchanged favorite provenance. No material intent/effect mismatch, collateral action, or unsupported claim that an unapplied action was already completed was found. All 13 tracked source hashes matched at the start and end and again at the final read-through. The run closed successfully; no accepted output or earlier report was rewritten to improve its score.

One intermediate cooking reply triggered the conservative action-claim guard, then the correction attempt passed. The rejected wording was not retained, so this is a conservative guard flag, not an independently audited false-action claim. The accepted cooking reply is advisory, although its explanation of not claiming completion is awkward.

The raw accepted replies retain these nonblocking limitations:

- Purchase-quantity clarification mentions packages, kilograms, or qualitative stock. Those replies do not themselves establish a supported purchased quantity and unit. Both cups-to-grams refusals ask for spinach form instead of directly requesting a gram measurement or qualitative stock. All four clarification outputs contain no operation and invent no amount.
- The 15-minute pasta revision relies on its stated pre-chopped vegetables and quick-cooking pasta; actual preparation time remains dependent on the kitchen and ingredients.
- The second broad lunch reply calls three shared meal occasions “three allocations.” Its validated result correctly contains six person-specific allocations, each one portion, across the requested three dates.

The current configuration remains `qwen3.5:27b` at the recorded digest, thinking off, temperature 0.2, 4,000 output tokens, and a 120-second timeout. These are the same twenty planning scenarios used previously. This report verifies regression behavior after correction and rejection-handling changes; it does not add model scenarios for correcting prepared balances or rejecting a candidate. Those flows require their separate domain, persistence, and browser evidence. The score does not establish taste, nutritional adequacy, allergen safety, hosted delivery, or completion of the actual household shopping cycle.
