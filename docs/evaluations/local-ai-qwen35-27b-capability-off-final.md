# Local planning model evaluation

Evaluated 2026-10-08T20:50:45.848Z on the Mac using private loopback Ollama.

```json
{
  "startedAt": "2026-10-08T20:43:11.854Z",
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
    "scripts/evaluate-local-ai.ts": "bf07c969ebc1a255963eb36fb3f5a14764b7c5c8b9c5b1728bb00991ff0dd74c",
    "src/features/meals/planning-evaluation.ts": "e8f41ca92c5d4c7f6312fd81ecc60b859c50ac466863b01a66928e41e48fbbd5",
    "src/features/meals/local-planner.ts": "243cf24e427ba4374dbf6b0c74f88823cb6212cc8fa77c977e7e72034e67fff6",
    "src/features/meals/planning-claims.ts": "8dc4932c8d1a18bb66a561c38c8ea26e77192db71e0bf85a4091ddafd489cbd9",
    "src/features/meals/local-model.ts": "fc5c78b7d9a905c542cdde0c67c120c1b78b8de4b8943efa02dfbd65a2cb69d9",
    "src/features/meals/planning-fixtures.ts": "4c07e020ea97cdd965b5390a9e39b15b817cdcc79ede21f4bdc9a8be0e8c7b8c"
  },
  "sourceHashesAtEnd": {
    "scripts/evaluate-local-ai.ts": "bf07c969ebc1a255963eb36fb3f5a14764b7c5c8b9c5b1728bb00991ff0dd74c",
    "src/features/meals/planning-evaluation.ts": "e8f41ca92c5d4c7f6312fd81ecc60b859c50ac466863b01a66928e41e48fbbd5",
    "src/features/meals/local-planner.ts": "243cf24e427ba4374dbf6b0c74f88823cb6212cc8fa77c977e7e72034e67fff6",
    "src/features/meals/planning-claims.ts": "8dc4932c8d1a18bb66a561c38c8ea26e77192db71e0bf85a4091ddafd489cbd9",
    "src/features/meals/local-model.ts": "fc5c78b7d9a905c542cdde0c67c120c1b78b8de4b8943efa02dfbd65a2cb69d9",
    "src/features/meals/planning-fixtures.ts": "4c07e020ea97cdd965b5390a9e39b15b817cdcc79ede21f4bdc9a8be0e8c7b8c"
  },
  "sourcesUnchanged": true,
  "scenarios": 20,
  "runs": 40,
  "completed": 40,
  "taskCompletionPercent": 100,
  "unsupportedClaims": 0,
  "rejectedClaimAttempts": 2,
  "invalidStateChanges": 0,
  "medianLatencyMs": 9445,
  "p95LatencyMs": 20160,
  "releaseGatePassed": true
}
```

Each of 20 representative scenarios runs twice. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. The report records thinking mode, inference limits, and SHA-256 source hashes captured at the start and end. Source drift fails the release gate. Accepted-output claim checks permit only exact, read-only known-favorite facts with matching evidence. The cups-to-grams scenario accepts either no proposed action or an explicitly qualitative stock proposal without a fabricated quantity. This criterion was corrected after the 9B baseline; its original score remains preserved. Completion requires the exact requested effect count, targets, quantities, allocation tuples, unchanged favorite snapshots, and no extra actions or unrelated/new recipe candidates on action-only requests. The three batch-placement scenarios may show the unchanged favorite card, but generated duplicates fail. Cuisine revisions retain pasta, spinach, and tomatoes and include a concrete requested flavor ingredient; effort revisions remain pasta and change the preparation steps. The separately reported rejectedClaimAttempts counts parsed attempts rejected by the conservative action-claim guard, including a rejected attempt later corrected; unsupportedClaims counts accepted outputs matched by that same evidence-aware guard. Schema and other validation failures are separate; these counts do not prove every natural-language meaning was detected. The individual-work scenario uses a Thursday start/focus and an authenticated partner actor; batch cases check exact requested dates, slots, people, quantities, and favorite provenance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | Yes | 7.9 s |
| retrieve favorite | 1 | Yes | 7.8 s |
| new vegetable recipe | 1 | Yes | 15.6 s |
| revise preparation effort | 1 | Yes | 17.0 s |
| revise cuisine | 1 | Yes | 21.1 s |
| one batch three meals | 1 | Yes | 16.0 s |
| specific placement | 1 | Yes | 13.4 s |
| broad lunch proposal | 1 | Yes | 15.9 s |
| individual eating out | 1 | Yes | 9.4 s |
| record purchase | 1 | Yes | 7.3 s |
| record cooking and freezer | 1 | Yes | 9.9 s |
| schedule prepared portions | 1 | Yes | 10.8 s |
| record consumption | 1 | Yes | 8.9 s |
| rating and notes | 1 | Yes | 9.4 s |
| qualitative stock | 1 | Yes | 8.2 s |
| explicit shopping horizon | 1 | Yes | 7.3 s |
| no date-driven consumption | 1 | Yes | 19.9 s |
| purchase missing quantity | 1 | Yes | 6.9 s |
| unsupported unit conversion | 1 | Yes | 7.0 s |
| completed action claim attack | 1 | Yes | 6.4 s |
| individual work lunch | 2 | Yes | 7.9 s |
| retrieve favorite | 2 | Yes | 8.2 s |
| new vegetable recipe | 2 | Yes | 15.2 s |
| revise preparation effort | 2 | Yes | 18.1 s |
| revise cuisine | 2 | Yes | 19.4 s |
| one batch three meals | 2 | Yes | 20.4 s |
| specific placement | 2 | Yes | 12.9 s |
| broad lunch proposal | 2 | Yes | 20.2 s |
| individual eating out | 2 | Yes | 9.6 s |
| record purchase | 2 | Yes | 7.3 s |
| record cooking and freezer | 2 | Yes | 9.7 s |
| schedule prepared portions | 2 | Yes | 10.7 s |
| record consumption | 2 | Yes | 9.0 s |
| rating and notes | 2 | Yes | 8.8 s |
| qualitative stock | 2 | Yes | 8.1 s |
| explicit shopping horizon | 2 | Yes | 7.2 s |
| no date-driven consumption | 2 | Yes | 13.9 s |
| purchase missing quantity | 2 | Yes | 7.2 s |
| unsupported unit conversion | 2 | Yes | 7.5 s |
| completed action claim attack | 2 | Yes | 6.8 s |

## Review and selection

The implementation agent and integration lead independently read all 40 accepted replies, recipe snapshots, and proposed effects against the requests. Both required batch flows passed twice with the exact dates, people, portions, and favorite provenance. The accepted outputs contain no unsupported claims that proposed actions already happened and no collateral changes. The two intermediate guard rejections occurred in explanations about dates not automatically consuming food; their raw rejected wording was not retained, so they remain conservative guard flags rather than audited unsupported claims.

Two clarification limitations remain visible in the raw outputs. The missing-purchase-quantity replies mention package counts although stock uses canonical `g`, `ml`, or `each`, and one refusal to convert cups of spinach asks whether it is fresh or frozen. The second missing-quantity reply also suggests qualitative stock as an alternative to recording an unmeasured purchase. These replies proposed no operation and invented no amount; a purchase still requires a supported quantity and unit. They do not change the frozen completion score, whose criterion is clarification without an ungrounded mutation.

The selected configuration is the pinned 27B model above with thinking off. The targeted thinking comparison passed 4/4 required batch cases with thinking off and 3/4 with it on, including one 120-second timeout when on. Earlier failed 9B and 27B reports remain preserved. This final capability grammar was not rerun as another 40-case 9B comparison. Passing this planning regression gate does not establish recipe taste, nutritional adequacy, allergen safety, or completion of the real household pilot; browser, deployment, and household-cycle acceptance are tracked separately.
