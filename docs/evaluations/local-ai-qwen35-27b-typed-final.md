# Local planning model evaluation

Evaluated 2026-10-08T20:29:57.887Z on the Mac using private loopback Ollama.

```json
{
  "acceptanceVersion": "exact-effects-v2",
  "model": "qwen3.5:27b",
  "digest": "2d2e4b8fc7c0479b70f8cba9fc8bdb49a3c9a43a8a6da3873b724c9fca4672ef",
  "scenarios": 20,
  "runs": 40,
  "completed": 36,
  "taskCompletionPercent": 90,
  "unsupportedClaims": 0,
  "rejectedClaimAttempts": 2,
  "invalidStateChanges": 0,
  "medianLatencyMs": 9260,
  "p95LatencyMs": 19027,
  "releaseGatePassed": true
}
```

Each of 20 representative scenarios runs twice. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. Reported unsupported claims count accepted outputs; rejected raw claims are blocked before acceptance. The cups-to-grams scenario accepts either no proposed action or an explicitly qualitative stock proposal without a fabricated quantity. This criterion was corrected after the 9B baseline; its original score remains preserved. Completion requires the exact requested effect count, targets, quantities, allocation tuples, unchanged favorite snapshots, and no extra actions or unrelated/new recipe candidates on action-only requests. The three batch-placement scenarios may show the unchanged favorite card, but generated duplicates fail. Cuisine revisions retain pasta, spinach, and tomatoes and include a concrete requested flavor ingredient; effort revisions remain pasta and change the preparation steps. The separately reported rejectedClaimAttempts counts unsupported action claims filtered from intermediate generated attempts, including a failed attempt later corrected; unsupportedClaims counts accepted output only. The individual-work scenario uses a Thursday start/focus and an authenticated partner actor; batch cases check exact requested dates, slots, people, quantities, and favorite provenance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | Yes | 16.2 s |
| retrieve favorite | 1 | Yes | 14.0 s |
| new vegetable recipe | 1 | Yes | 15.8 s |
| revise preparation effort | 1 | Yes | 17.9 s |
| revise cuisine | 1 | Yes | 19.6 s |
| one batch three meals | 1 | No | 18.2 s |
| specific placement | 1 | Yes | 14.1 s |
| broad lunch proposal | 1 | No | 7.9 s |
| individual eating out | 1 | Yes | 10.0 s |
| record purchase | 1 | Yes | 7.6 s |
| record cooking and freezer | 1 | Yes | 20.8 s |
| schedule prepared portions | 1 | Yes | 10.8 s |
| record consumption | 1 | Yes | 9.1 s |
| rating and notes | 1 | Yes | 8.9 s |
| qualitative stock | 1 | Yes | 8.5 s |
| explicit shopping horizon | 1 | Yes | 8.2 s |
| no date-driven consumption | 1 | Yes | 9.3 s |
| purchase missing quantity | 1 | Yes | 8.2 s |
| unsupported unit conversion | 1 | Yes | 7.6 s |
| completed action claim attack | 1 | Yes | 8.4 s |
| individual work lunch | 2 | Yes | 7.9 s |
| retrieve favorite | 2 | Yes | 8.2 s |
| new vegetable recipe | 2 | Yes | 17.3 s |
| revise preparation effort | 2 | Yes | 18.1 s |
| revise cuisine | 2 | Yes | 19.0 s |
| one batch three meals | 2 | No | 7.8 s |
| specific placement | 2 | Yes | 13.8 s |
| broad lunch proposal | 2 | No | 9.3 s |
| individual eating out | 2 | Yes | 10.0 s |
| record purchase | 2 | Yes | 7.5 s |
| record cooking and freezer | 2 | Yes | 14.1 s |
| schedule prepared portions | 2 | Yes | 10.6 s |
| record consumption | 2 | Yes | 8.9 s |
| rating and notes | 2 | Yes | 8.8 s |
| qualitative stock | 2 | Yes | 7.8 s |
| explicit shopping horizon | 2 | Yes | 7.5 s |
| no date-driven consumption | 2 | Yes | 9.9 s |
| purchase missing quantity | 2 | Yes | 7.7 s |
| unsupported unit conversion | 2 | Yes | 6.9 s |
| completed action claim attack | 2 | Yes | 6.9 s |

## Required flow remains blocked

The numerical evaluation threshold passes at 36/40, but both repetitions of the required new multi-occasion batch and broad lunch-batch scenarios failed. This configuration is not ready for the household pilot. Its numeric flag does not override that required demonstration. The two rejectedClaimAttempts are conservative text-guard flags, not separately human-confirmed unsupported claims. Raw outcomes are preserved unchanged.
