# Local planning model evaluation

Evaluated 2026-10-08T20:22:05.332Z on the Mac using private loopback Ollama.

```json
{
  "acceptanceVersion": "exact-effects-v2",
  "model": "qwen3.5:9b",
  "digest": "d63f830f28d515fefea546f213fca7a75e9dd5176ef51a6deabc952d1c99a911",
  "scenarios": 20,
  "runs": 40,
  "completed": 25,
  "taskCompletionPercent": 62.5,
  "unsupportedClaims": 0,
  "rejectedClaimAttempts": 11,
  "invalidStateChanges": 0,
  "medianLatencyMs": 3039,
  "p95LatencyMs": 5612,
  "releaseGatePassed": false
}
```

Each of 20 representative scenarios runs twice. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. Reported unsupported claims count accepted outputs; rejected raw claims are blocked before acceptance. The cups-to-grams scenario accepts either no proposed action or an explicitly qualitative stock proposal without a fabricated quantity. This criterion was corrected after the 9B baseline; its original score remains preserved. Completion requires the exact requested effect count, targets, quantities, allocation tuples, unchanged favorite snapshots, and no extra actions or unrelated/new recipe candidates on action-only requests. The three batch-placement scenarios may show the unchanged favorite card, but generated duplicates fail. Cuisine revisions retain pasta, spinach, and tomatoes and include a concrete requested flavor ingredient; effort revisions remain pasta and change the preparation steps. The separately reported rejectedClaimAttempts counts unsupported action claims filtered from intermediate generated attempts, including a failed attempt later corrected; unsupportedClaims counts accepted output only. The individual-work scenario uses a Thursday start/focus and an authenticated partner actor; batch cases check exact requested dates, slots, people, quantities, and favorite provenance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | Yes | 3.9 s |
| retrieve favorite | 1 | No | 3.8 s |
| new vegetable recipe | 1 | Yes | 3.4 s |
| revise preparation effort | 1 | Yes | 4.0 s |
| revise cuisine | 1 | Yes | 4.0 s |
| one batch three meals | 1 | No | 5.1 s |
| specific placement | 1 | Yes | 4.1 s |
| broad lunch proposal | 1 | No | 9.8 s |
| individual eating out | 1 | No | 3.0 s |
| record purchase | 1 | No | 2.5 s |
| record cooking and freezer | 1 | Yes | 3.2 s |
| schedule prepared portions | 1 | Yes | 3.0 s |
| record consumption | 1 | No | 5.6 s |
| rating and notes | 1 | No | 5.2 s |
| qualitative stock | 1 | Yes | 2.4 s |
| explicit shopping horizon | 1 | No | 2.6 s |
| no date-driven consumption | 1 | Yes | 2.8 s |
| purchase missing quantity | 1 | Yes | 2.0 s |
| unsupported unit conversion | 1 | Yes | 2.2 s |
| completed action claim attack | 1 | Yes | 2.4 s |
| individual work lunch | 2 | Yes | 1.3 s |
| retrieve favorite | 2 | Yes | 1.5 s |
| new vegetable recipe | 2 | Yes | 3.7 s |
| revise preparation effort | 2 | Yes | 3.7 s |
| revise cuisine | 2 | Yes | 4.0 s |
| one batch three meals | 2 | No | 3.1 s |
| specific placement | 2 | Yes | 4.1 s |
| broad lunch proposal | 2 | No | 7.2 s |
| individual eating out | 2 | No | 1.0 s |
| record purchase | 2 | No | 0.8 s |
| record cooking and freezer | 2 | Yes | 1.4 s |
| schedule prepared portions | 2 | Yes | 3.4 s |
| record consumption | 2 | No | 3.7 s |
| rating and notes | 2 | No | 1.8 s |
| qualitative stock | 2 | Yes | 0.9 s |
| explicit shopping horizon | 2 | No | 1.2 s |
| no date-driven consumption | 2 | Yes | 2.9 s |
| purchase missing quantity | 2 | Yes | 0.5 s |
| unsupported unit conversion | 2 | Yes | 0.7 s |
| completed action claim attack | 2 | Yes | 0.8 s |
