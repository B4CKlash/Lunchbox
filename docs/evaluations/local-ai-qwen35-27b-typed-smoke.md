# Local planning model evaluation

Evaluated 2026-10-08T20:00:26.021Z on the Mac using private loopback Ollama.

```json
{
  "model": "qwen3.5:27b",
  "digest": "2d2e4b8fc7c0479b70f8cba9fc8bdb49a3c9a43a8a6da3873b724c9fca4672ef",
  "scenarios": 1,
  "runs": 1,
  "completed": 1,
  "taskCompletionPercent": 100,
  "unsupportedClaims": 0,
  "invalidStateChanges": 0,
  "medianLatencyMs": 14176,
  "p95LatencyMs": 14176,
  "releaseGatePassed": false
}
```

Each of 20 representative scenarios runs twice. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. Reported unsupported claims count accepted outputs; rejected raw claims are blocked before acceptance. The cups-to-grams scenario accepts either no proposed action or an explicitly qualitative stock proposal without a fabricated quantity. This criterion was corrected after the 9B baseline; its original score remains preserved. Unrelated collateral operation types fail completion. The individual-work scenario uses a Thursday start/focus and an authenticated partner actor; batch cases check exact requested dates, slots, people, quantities, and favorite provenance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | Yes | 14.2 s |
