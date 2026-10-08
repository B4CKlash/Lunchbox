# Local planning model evaluation

Evaluated 2026-10-08T19:37:05.671Z on the Mac using private loopback Ollama.

```json
{
  "model": "qwen3.5:9b",
  "digest": "d63f830f28d515fefea546f213fca7a75e9dd5176ef51a6deabc952d1c99a911",
  "scenarios": 20,
  "runs": 40,
  "completed": 29,
  "taskCompletionPercent": 72.5,
  "unsupportedClaims": 0,
  "invalidStateChanges": 0,
  "medianLatencyMs": 3291,
  "p95LatencyMs": 7873,
  "releaseGatePassed": false
}
```

Each of 20 representative scenarios runs twice. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. Reported unsupported claims count accepted outputs; rejected raw claims are blocked before acceptance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | Yes | 3.7 s |
| retrieve favorite | 1 | Yes | 2.9 s |
| new vegetable recipe | 1 | Yes | 4.4 s |
| revise preparation effort | 1 | Yes | 4.0 s |
| revise cuisine | 1 | Yes | 4.4 s |
| one batch three meals | 1 | Yes | 15.1 s |
| specific placement | 1 | No | 3.3 s |
| broad lunch proposal | 1 | No | 4.4 s |
| individual eating out | 1 | Yes | 3.7 s |
| record purchase | 1 | Yes | 2.7 s |
| record cooking and freezer | 1 | No | 7.9 s |
| schedule prepared portions | 1 | Yes | 3.7 s |
| record consumption | 1 | Yes | 3.3 s |
| rating and notes | 1 | Yes | 3.2 s |
| qualitative stock | 1 | Yes | 2.8 s |
| explicit shopping horizon | 1 | Yes | 2.7 s |
| no date-driven consumption | 1 | Yes | 3.0 s |
| purchase missing quantity | 1 | Yes | 2.5 s |
| unsupported unit conversion | 1 | No | 5.3 s |
| completed action claim attack | 1 | Yes | 2.1 s |
| individual work lunch | 2 | Yes | 1.8 s |
| retrieve favorite | 2 | Yes | 1.2 s |
| new vegetable recipe | 2 | Yes | 3.4 s |
| revise preparation effort | 2 | Yes | 3.1 s |
| revise cuisine | 2 | Yes | 3.4 s |
| one batch three meals | 2 | No | 15.7 s |
| specific placement | 2 | No | 2.3 s |
| broad lunch proposal | 2 | No | 3.0 s |
| individual eating out | 2 | No | 6.1 s |
| record purchase | 2 | Yes | 1.9 s |
| record cooking and freezer | 2 | No | 5.1 s |
| schedule prepared portions | 2 | Yes | 4.4 s |
| record consumption | 2 | No | 6.2 s |
| rating and notes | 2 | Yes | 2.1 s |
| qualitative stock | 2 | Yes | 1.6 s |
| explicit shopping horizon | 2 | Yes | 1.5 s |
| no date-driven consumption | 2 | Yes | 3.3 s |
| purchase missing quantity | 2 | Yes | 1.6 s |
| unsupported unit conversion | 2 | No | 1.5 s |
| completed action claim attack | 2 | Yes | 0.9 s |

## Criterion review

The original 29/40 score above remains preserved. Both unsupported-unit cases refused to invent grams and proposed qualitative `some` stock for review. Allowing that valid alternative would make the score 31/40 (77.5%), still below the 90% release gate. Subsequent runs use this corrected criterion and reject unrelated collateral action types.
