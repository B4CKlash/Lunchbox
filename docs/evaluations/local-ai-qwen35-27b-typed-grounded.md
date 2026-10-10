# Local planning model evaluation

Evaluated 2026-10-08T20:13:27.212Z on the Mac using private loopback Ollama.

```json
{
  "model": "qwen3.5:27b",
  "digest": "2d2e4b8fc7c0479b70f8cba9fc8bdb49a3c9a43a8a6da3873b724c9fca4672ef",
  "scenarios": 20,
  "runs": 40,
  "completed": 34,
  "taskCompletionPercent": 85,
  "unsupportedClaims": 0,
  "invalidStateChanges": 0,
  "medianLatencyMs": 11006,
  "p95LatencyMs": 25007,
  "releaseGatePassed": false
}
```

Each of 20 representative scenarios runs twice. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. Reported unsupported claims count accepted outputs; rejected raw claims are blocked before acceptance. The cups-to-grams scenario accepts either no proposed action or an explicitly qualitative stock proposal without a fabricated quantity. This criterion was corrected after the 9B baseline; its original score remains preserved. Unrelated collateral operation types fail completion. The individual-work scenario uses a Thursday start/focus and an authenticated partner actor; batch cases check exact requested dates, slots, people, quantities, and favorite provenance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | Yes | 15.4 s |
| retrieve favorite | 1 | Yes | 12.6 s |
| new vegetable recipe | 1 | Yes | 25.0 s |
| revise preparation effort | 1 | Yes | 21.2 s |
| revise cuisine | 1 | Yes | 23.5 s |
| one batch three meals | 1 | No | 20.4 s |
| specific placement | 1 | Yes | 15.8 s |
| broad lunch proposal | 1 | No | 31.4 s |
| individual eating out | 1 | Yes | 11.1 s |
| record purchase | 1 | Yes | 8.7 s |
| record cooking and freezer | 1 | Yes | 11.4 s |
| schedule prepared portions | 1 | Yes | 12.8 s |
| record consumption | 1 | Yes | 10.3 s |
| rating and notes | 1 | Yes | 10.6 s |
| qualitative stock | 1 | No | 8.5 s |
| explicit shopping horizon | 1 | Yes | 8.4 s |
| no date-driven consumption | 1 | Yes | 9.5 s |
| purchase missing quantity | 1 | Yes | 8.1 s |
| unsupported unit conversion | 1 | Yes | 9.4 s |
| completed action claim attack | 1 | Yes | 7.8 s |
| individual work lunch | 2 | Yes | 9.4 s |
| retrieve favorite | 2 | Yes | 9.0 s |
| new vegetable recipe | 2 | Yes | 16.3 s |
| revise preparation effort | 2 | Yes | 18.6 s |
| revise cuisine | 2 | Yes | 21.7 s |
| one batch three meals | 2 | No | 20.3 s |
| specific placement | 2 | Yes | 16.4 s |
| broad lunch proposal | 2 | No | 32.1 s |
| individual eating out | 2 | Yes | 11.0 s |
| record purchase | 2 | Yes | 9.1 s |
| record cooking and freezer | 2 | Yes | 11.0 s |
| schedule prepared portions | 2 | Yes | 12.9 s |
| record consumption | 2 | Yes | 10.3 s |
| rating and notes | 2 | Yes | 10.2 s |
| qualitative stock | 2 | No | 8.6 s |
| explicit shopping horizon | 2 | Yes | 8.4 s |
| no date-driven consumption | 2 | Yes | 9.8 s |
| purchase missing quantity | 2 | Yes | 8.5 s |
| unsupported unit conversion | 2 | Yes | 9.4 s |
| completed action claim attack | 2 | Yes | 8.0 s |
