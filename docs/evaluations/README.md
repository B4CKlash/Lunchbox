# Local model evaluation record

Reports are development evidence, not proof that the household pilot is enabled. The final model must pass twenty scenarios twice, and the required batch-planning demonstration must work. Smaller targeted runs cannot establish the full gate. See [delivery status](../HOUSEHOLD_PILOT_DELIVERY.md) for the current release decision.

| Evaluation | Outcome | Meaning |
| --- | --- | --- |
| [Initial 9B](local-ai-qwen35-9b.md) | 31/40, 77.5% | Failed. This earlier harness had a different actor/date setup and less strict effect checks. |
| Initial 27B partial and weekday reports | Stopped or diagnostic runs | Preserved failures during date, actor, and record-reference grounding. They cannot pass a release gate. |
| [Typed 27B baseline](local-ai-qwen35-27b-typed-grounded.md) | 34/40, 85% | Failed. New batches across several occasions and qualitative stock failed twice. |
| [Strict 9B comparison](local-ai-qwen35-9b-typed-final.md) | 25/40, 62.5% | Failed under exact-effects-v2. A separate raw-reply audit distinguishes real unsupported action claims from a conservative favorite-description false positive. |
| [Strict 27B comparison](local-ai-qwen35-27b-typed-final.md) | 36/40, 90% | Meets the numeric threshold, but both required multi-occasion batch cases still fail twice. This configuration is not ready for the pilot. |
| Capability and thinking targeted reports | Diagnostic only | Corrected batch grammar: thinking off passed 4/4; thinking on passed 3/4 with a timeout. |
| [Final 27B, thinking off](local-ai-qwen35-27b-capability-off-final.md) | **40/40, 100%** | Passed exact-effects-v2, including both required batch scenarios twice. Zero accepted unsupported completion claims or invalid state changes; unchanged source hashes. Median 9.445 s, p95 20.160 s. |

The `*-claim-audit.json` and `*-supplemental.json` files record additional diagnostic cases, including manually identified failures that coarse supplemental checks missed. Original outputs and scores are retained. Later fixes do not retroactively change the evidence for earlier configurations.

All runs use private loopback Ollama. Latency includes validation and any permitted correction attempt. A text guard is conservative: its rejected flags are not automatically proof of a false completion claim. Accepted output must still be checked against the actual requested effect. Only a validated application receipt establishes that a household action was applied.

Selected development configuration: `qwen3.5:27b`, digest `2d2e4b8fc7c0479b70f8cba9fc8bdb49a3c9a43a8a6da3873b724c9fca4672ef`, thinking off, temperature 0.2, maximum 4,000 output tokens, 120-second timeout. Two conservative intermediate replies were rejected and corrected. Both the domain and root reviews inspected all forty accepted replies and effects. The report records minor clarification-wording limitations. This passes the local model gate; it does not establish hosted delivery or a real household cycle.
