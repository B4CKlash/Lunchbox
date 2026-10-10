# Local planning model evaluation

Evaluated 2026-10-08T19:33:47.471Z on the Mac using private loopback Ollama.

```json
{
  "model": "qwen3.5:9b",
  "digest": "d63f830f28d515fefea546f213fca7a75e9dd5176ef51a6deabc952d1c99a911",
  "scenarios": 3,
  "runs": 3,
  "completed": 2,
  "taskCompletionPercent": 66.7,
  "unsupportedClaims": 0,
  "invalidStateChanges": 0,
  "medianLatencyMs": 3750,
  "p95LatencyMs": 4324,
  "releaseGatePassed": false
}
```

Each of 20 representative scenarios runs twice. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. Reported unsupported claims count accepted outputs; rejected raw claims are blocked before acceptance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | No | 3.8 s |
| retrieve favorite | 1 | Yes | 3.2 s |
| new vegetable recipe | 1 | Yes | 4.3 s |
