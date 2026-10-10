# Local planning model evaluation

Evaluated 2026-10-08T19:33:11.348Z on the Mac using private loopback Ollama.

```json
{
  "model": "qwen3.5:9b",
  "digest": "d63f830f28d515fefea546f213fca7a75e9dd5176ef51a6deabc952d1c99a911",
  "scenarios": 1,
  "runs": 1,
  "completed": 0,
  "taskCompletionPercent": 0,
  "unsupportedClaims": 0,
  "invalidStateChanges": 0,
  "medianLatencyMs": 7966,
  "p95LatencyMs": 7966,
  "releaseGatePassed": false
}
```

Each of 20 representative scenarios runs twice. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. Reported unsupported claims count accepted outputs; rejected raw claims are blocked before acceptance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | No | 8.0 s |
