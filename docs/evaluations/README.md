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
| [Capability 27B, thinking off](local-ai-qwen35-27b-capability-off-final.md) | **40/40, 100%** | Preserved passing run before the correction, purchase-history, and rejected-candidate changes. Median 9.445 s, p95 20.160 s. |
| [Current 27B after corrections and rejection handling](local-ai-qwen35-27b-corrections-rejections.md) | **40/40, 100%** | Passed the same exact-effects-v2 scenarios, including both required batch scenarios twice. Zero accepted unsupported completion claims or invalid state changes; all 13 tracked source hashes unchanged. Median 9.366 s, p95 20.599 s. |

| [Profile and package extension, 2026-10-10](local-ai-qwen35-27b-profile-package-2026-10-10.md) | **63/66, 95.5%; original 39/40, 97.5%** | Passes the established overall/original >=90% gate with zero accepted unsupported claims, invalid changes or mutations and 19 unchanged hashes. Category-dislike generation failed safely in both runs; no-date-driven consumption failed safely once. Profile12/12 and package8/8; 18 deterministic cases are reported separately from 48 inference runs. |

The `*-claim-audit.json` and `*-supplemental.json` files record additional diagnostic cases, including manually identified failures that coarse supplemental checks missed. Original outputs and scores are retained. Later fixes do not retroactively change the evidence for earlier configurations.

All runs use private loopback Ollama. Latency includes validation and any permitted correction attempt. A text guard is conservative: its rejected flags are not automatically proof of a false completion claim. Accepted output must still be checked against the actual requested effect. Only a validated application receipt establishes that a household action was applied.

Selected development configuration: `qwen3.5:27b`, digest `2d2e4b8fc7c0479b70f8cba9fc8bdb49a3c9a43a8a6da3873b724c9fca4672ef`, thinking off, temperature 0.2, maximum 4,000 output tokens, 120-second timeout. The 2026-10-09 corrections/rejections baseline had one intermediate reply rejected by the conservative guard and then corrected. Both the domain and root reviews inspected all forty accepted replies and effects. The report preserves minor clarification, recipe-timing, and terminology limitations. That baseline used the same twenty planning scenarios; prepared-food corrections, purchase metadata, and rejected-candidate interactions have separate focused domain and browser verification. This passes the local model regression gate; it does not establish hosted delivery or a real household cycle.

The profile/package extension keeps those twenty requests and exact-effect checks, adds thirteen cases, and runs all thirty-three twice. Actual inference median/p95 were 14.075 s / 25.369 s. The accepted replies/effects and all nineteen source hashes were independently reviewed. Its aggregate pass does not imply that category-dislike generation succeeded: both such runs were rejected by the eligibility guard, with no accepted candidate or effect. See the dated report for preserved failures and wording limits.
