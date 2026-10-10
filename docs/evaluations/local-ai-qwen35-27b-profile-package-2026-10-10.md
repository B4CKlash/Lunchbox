# Local planning model evaluation

Evaluated 2026-10-10T18:49:36.052Z on the Mac using private loopback Ollama.

```json
{
  "startedAt": "2026-10-10T18:36:33.616Z",
  "acceptanceVersion": "exact-effects-v3-knowledge",
  "model": "qwen3.5:27b",
  "digest": "2d2e4b8fc7c0479b70f8cba9fc8bdb49a3c9a43a8a6da3873b724c9fca4672ef",
  "inferenceConfig": {
    "thinking": "off",
    "temperature": 0.2,
    "maxOutputTokens": 4000,
    "timeoutMs": 120000
  },
  "sourceHashes": {
    "scripts/evaluate-local-ai.ts": "e891a7ae7a91b6478b39decfc6e8ae6d4b0fa85009914a8fd7be2031abf16904",
    "src/features/meals/planning-evaluation.ts": "2c5ddcbdd423b80dadaa291f58718556f2bddf027b326ca7641287f9f4775fc4",
    "src/features/meals/local-planner.ts": "f943d6c119a134c2ded8dd829a3f24a97ea3750d4a2b55e969652280d0049efd",
    "src/features/meals/planning-claims.ts": "8dc4932c8d1a18bb66a561c38c8ea26e77192db71e0bf85a4091ddafd489cbd9",
    "src/features/meals/local-model.ts": "fc5c78b7d9a905c542cdde0c67c120c1b78b8de4b8943efa02dfbd65a2cb69d9",
    "src/features/meals/planning-fixtures.ts": "9e9f3c2900b61dc45f7e0b4049f3fac12c94f9a7b6e3e553ed0f9f7c85f3e564",
    "src/lib/contracts.ts": "4c83cca4c131f65df870a0cebea826773e3a4b6642ad2042f8c66c186b236479",
    "src/features/planning/pilot.ts": "719948f7dcf4ded3865a1f903618b03b6c8f54974ba5fa7f0a2c95b4680a7afd",
    "src/features/planning/direct-placement.ts": "b00d5984314923ac1b325c54583ecb96f415979d745d5777bac86bab8d17ea58",
    "src/features/planning/calendar.ts": "eaa6444c4b215df86cee6bb0d26af1a0985296f5634b76cc99bd15d5657fb925",
    "src/features/pantry/ingredients.ts": "c69d94abe5c142bdfdfd7f3812d161176b8a6a2b2a9edb4be46c08530c37690d",
    "src/features/pantry/categories.ts": "512287e2a31ff77d413024f5f0f02d31395e855117c6bab1e854a93f6eb3832f",
    "src/features/pantry/stock-projection.ts": "15776e8383be80beb11549fa11633ea38e76be200ac6f5c8b95959dfb4b26a54",
    "src/features/pantry/natural-stock-entry.ts": "45a22f0e5ae949c99d34e14e16ea2330a977311a28e5e6849cdba86eb7166560",
    "src/features/planning/profile.ts": "02e1ae04dda21ab90b7188ef00d43ce88069a0611885db4cbfa4dfdac37ac044",
    "src/features/meals/recommendation-context.ts": "d3ede5d488f2b278dc67cfd2b403ead6b42c98dd77874e3f7b3651e34dc0177c",
    "src/features/meals/recommendation-constraints.ts": "023dd18825c3c82ee3f6f4956382666d6962110c31e18de53c00f292cd418309",
    "src/features/meals/live-provider.ts": "fe92d8f70c2bcf5bbe47254c5c9487edfe184a8d0f0964c75fc40470b176e2cc",
    "src/features/meals/jobs.ts": "cb205ffdebdb9dca06c6f0b60503db9abd871697a76d2df361a9685f70a43b20"
  },
  "sourceHashesAtEnd": {
    "scripts/evaluate-local-ai.ts": "e891a7ae7a91b6478b39decfc6e8ae6d4b0fa85009914a8fd7be2031abf16904",
    "src/features/meals/planning-evaluation.ts": "2c5ddcbdd423b80dadaa291f58718556f2bddf027b326ca7641287f9f4775fc4",
    "src/features/meals/local-planner.ts": "f943d6c119a134c2ded8dd829a3f24a97ea3750d4a2b55e969652280d0049efd",
    "src/features/meals/planning-claims.ts": "8dc4932c8d1a18bb66a561c38c8ea26e77192db71e0bf85a4091ddafd489cbd9",
    "src/features/meals/local-model.ts": "fc5c78b7d9a905c542cdde0c67c120c1b78b8de4b8943efa02dfbd65a2cb69d9",
    "src/features/meals/planning-fixtures.ts": "9e9f3c2900b61dc45f7e0b4049f3fac12c94f9a7b6e3e553ed0f9f7c85f3e564",
    "src/lib/contracts.ts": "4c83cca4c131f65df870a0cebea826773e3a4b6642ad2042f8c66c186b236479",
    "src/features/planning/pilot.ts": "719948f7dcf4ded3865a1f903618b03b6c8f54974ba5fa7f0a2c95b4680a7afd",
    "src/features/planning/direct-placement.ts": "b00d5984314923ac1b325c54583ecb96f415979d745d5777bac86bab8d17ea58",
    "src/features/planning/calendar.ts": "eaa6444c4b215df86cee6bb0d26af1a0985296f5634b76cc99bd15d5657fb925",
    "src/features/pantry/ingredients.ts": "c69d94abe5c142bdfdfd7f3812d161176b8a6a2b2a9edb4be46c08530c37690d",
    "src/features/pantry/categories.ts": "512287e2a31ff77d413024f5f0f02d31395e855117c6bab1e854a93f6eb3832f",
    "src/features/pantry/stock-projection.ts": "15776e8383be80beb11549fa11633ea38e76be200ac6f5c8b95959dfb4b26a54",
    "src/features/pantry/natural-stock-entry.ts": "45a22f0e5ae949c99d34e14e16ea2330a977311a28e5e6849cdba86eb7166560",
    "src/features/planning/profile.ts": "02e1ae04dda21ab90b7188ef00d43ce88069a0611885db4cbfa4dfdac37ac044",
    "src/features/meals/recommendation-context.ts": "d3ede5d488f2b278dc67cfd2b403ead6b42c98dd77874e3f7b3651e34dc0177c",
    "src/features/meals/recommendation-constraints.ts": "023dd18825c3c82ee3f6f4956382666d6962110c31e18de53c00f292cd418309",
    "src/features/meals/live-provider.ts": "fe92d8f70c2bcf5bbe47254c5c9487edfe184a8d0f0964c75fc40470b176e2cc",
    "src/features/meals/jobs.ts": "cb205ffdebdb9dca06c6f0b60503db9abd871697a76d2df361a9685f70a43b20"
  },
  "sourcesUnchanged": true,
  "scenarios": 33,
  "runs": 66,
  "completed": 63,
  "originalScenarios": 20,
  "originalRuns": 40,
  "groupCompletion": {
    "original": {
      "runs": 40,
      "completed": 39,
      "taskCompletionPercent": 97.5
    },
    "profile": {
      "runs": 12,
      "completed": 12,
      "taskCompletionPercent": 100
    },
    "generation": {
      "runs": 6,
      "completed": 4,
      "taskCompletionPercent": 66.7
    },
    "package": {
      "runs": 8,
      "completed": 8,
      "taskCompletionPercent": 100
    }
  },
  "taskCompletionPercent": 95.5,
  "unsupportedClaims": 0,
  "rejectedClaimAttempts": 3,
  "invalidStateChanges": 0,
  "invalidProposedChanges": 0,
  "generatedAttempts": 52,
  "inferenceRuns": 48,
  "inferenceMedianLatencyMs": 14075,
  "inferenceP95LatencyMs": 25369,
  "medianLatencyMs": 11459,
  "p95LatencyMs": 24524,
  "releaseGatePassed": true
}
```

The original 20 representative scenarios retain their exact-effects-v2 requests and checks. By default all 33 scenarios, including profile and package extensions, run twice. A full gate requires every scenario in every pass, at least 90% completion for both the original group and the complete suite, zero accepted unsupported claims, zero invalid proposed changes or input mutations, and no source drift. Partial runs cannot pass. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. The report records thinking mode, inference limits, SHA-256 source hashes captured at the start and end, scenario groups, and actual generation-attempt counts. Explicit memory and package observations are deterministic application paths; recipe and package-explanation cases must actually invoke the model. Profile checks compare exact result.profileChanges, scope, canonical target, correction/removal, and original source text. Recipe checks cover unavailable oven use, an outside-audience dislike, and a current audience category dislike. Package checks preserve source text, whole counts or qualitative partials, and require the known measured amount plus the unverified remainder without invented container conversions. These bounded checks cannot establish every semantic implication of a reply. Source drift fails the release gate. Accepted-output claim checks permit only exact, read-only known-favorite facts with matching evidence. The cups-to-grams scenario accepts either no proposed action or an explicitly qualitative stock proposal without a fabricated quantity. This criterion was corrected after the 9B baseline; its original score remains preserved. Completion requires the exact requested effect count, targets, quantities, allocation tuples, unchanged favorite snapshots, and no extra actions or unrelated/new recipe candidates on action-only requests. The three batch-placement scenarios may show the unchanged favorite card, but generated duplicates fail. Cuisine revisions retain pasta, spinach, and tomatoes and include a concrete requested flavor ingredient; effort revisions remain pasta and change the preparation steps. The separately reported rejectedClaimAttempts counts parsed attempts rejected by the conservative action-claim guard, including a rejected attempt later corrected; unsupportedClaims counts accepted outputs matched by that same evidence-aware guard. Schema and other validation failures are separate; these counts do not prove every natural-language meaning was detected. The individual-work scenario uses a Thursday start/focus and an authenticated partner actor; batch cases check exact requested dates, slots, people, quantities, and favorite provenance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | Yes | 21.1 s |
| retrieve favorite | 1 | Yes | 18.8 s |
| new vegetable recipe | 1 | Yes | 20.1 s |
| revise preparation effort | 1 | Yes | 22.0 s |
| revise cuisine | 1 | Yes | 24.3 s |
| one batch three meals | 1 | Yes | 24.5 s |
| specific placement | 1 | Yes | 16.5 s |
| broad lunch proposal | 1 | Yes | 24.1 s |
| individual eating out | 1 | Yes | 12.7 s |
| record purchase | 1 | Yes | 10.1 s |
| record cooking and freezer | 1 | Yes | 12.8 s |
| schedule prepared portions | 1 | Yes | 14.1 s |
| record consumption | 1 | Yes | 12.2 s |
| rating and notes | 1 | Yes | 12.7 s |
| qualitative stock | 1 | Yes | 11.2 s |
| explicit shopping horizon | 1 | Yes | 10.2 s |
| no date-driven consumption | 1 | Yes | 25.4 s |
| purchase missing quantity | 1 | Yes | 10.1 s |
| unsupported unit conversion | 1 | Yes | 9.8 s |
| completed action claim attack | 1 | Yes | 10.0 s |
| member ingredient dislike memory | 1 | Yes | 0.0 s |
| household category dislike memory | 1 | Yes | 0.0 s |
| unavailable oven memory | 1 | Yes | 0.0 s |
| available blender memory | 1 | Yes | 0.0 s |
| correct oven availability | 1 | Yes | 0.0 s |
| forget personal ingredient dislike | 1 | Yes | 0.0 s |
| unavailable oven generation | 1 | Yes | 18.7 s |
| other member dislike does not exclude actor | 1 | Yes | 19.2 s |
| audience category dislike generation | 1 | No | 36.9 s |
| package total observation | 1 | Yes | 0.0 s |
| package purchase observation | 1 | Yes | 0.0 s |
| partial package observation | 1 | Yes | 0.0 s |
| package sufficiency explanation | 1 | Yes | 14.3 s |
| individual work lunch | 2 | Yes | 10.3 s |
| retrieve favorite | 2 | Yes | 10.8 s |
| new vegetable recipe | 2 | Yes | 19.3 s |
| revise preparation effort | 2 | Yes | 20.1 s |
| revise cuisine | 2 | Yes | 19.7 s |
| one batch three meals | 2 | Yes | 22.5 s |
| specific placement | 2 | Yes | 15.2 s |
| broad lunch proposal | 2 | Yes | 22.5 s |
| individual eating out | 2 | Yes | 12.0 s |
| record purchase | 2 | Yes | 9.5 s |
| record cooking and freezer | 2 | Yes | 11.8 s |
| schedule prepared portions | 2 | Yes | 13.2 s |
| record consumption | 2 | Yes | 11.5 s |
| rating and notes | 2 | Yes | 11.0 s |
| qualitative stock | 2 | Yes | 10.3 s |
| explicit shopping horizon | 2 | Yes | 9.5 s |
| no date-driven consumption | 2 | No | 23.9 s |
| purchase missing quantity | 2 | Yes | 9.2 s |
| unsupported unit conversion | 2 | Yes | 9.7 s |
| completed action claim attack | 2 | Yes | 9.7 s |
| member ingredient dislike memory | 2 | Yes | 0.0 s |
| household category dislike memory | 2 | Yes | 0.0 s |
| unavailable oven memory | 2 | Yes | 0.0 s |
| available blender memory | 2 | Yes | 0.0 s |
| correct oven availability | 2 | Yes | 0.0 s |
| forget personal ingredient dislike | 2 | Yes | 0.0 s |
| unavailable oven generation | 2 | Yes | 18.9 s |
| other member dislike does not exclude actor | 2 | Yes | 20.4 s |
| audience category dislike generation | 2 | No | 36.0 s |
| package total observation | 2 | Yes | 0.0 s |
| package purchase observation | 2 | Yes | 0.0 s |
| partial package observation | 2 | Yes | 0.0 s |
| package sufficiency explanation | 2 | Yes | 13.7 s |

## Independent review — 2026-10-10

Root and domain review inspected accepted replies/effects and verified all 19 source hashes against the current model path. The gate passes at 63/66 overall and 39/40 original runs; all profile effects and package observations/explanations passed. Eighteen deterministic observations are distinct from 48 inference runs. Both batch-planning scenarios passed twice.

Category-dislike generation failed both runs (0/2) after the current-audience eligibility guard rejected candidates. The second no-date-driven-consumption run failed after two conservative claim-guard rejections. No result or action from those three runs was accepted. Rejected raw candidates are not retained, so the exact conflicting ingredient or rejected wording cannot be reconstructed from this report. Do not interpret the aggregate gate as proof that category-dislike generation succeeded.

Minor accepted-output wording limits: one conversion clarification implies that spinach form may help determine grams, without proposing any amount or action; one package explanation describes the 500 g requirement remainder as what two boxes “represent,” then immediately states that their weights remain unknown and must be checked. Neither invents a conversion, applies a stock quantity, or confirms sufficiency. These observations do not replace HP-10's real household acceptance.
