# Local planning model evaluation

Evaluated 2026-10-10T19:46:48.445Z on the Mac using private loopback Ollama.

```json
{
  "startedAt": "2026-10-10T19:33:34.910Z",
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
    "src/features/planning/profile.ts": "333502d943091fb234f67dbce558137b5a37efca032ffd8553477d00f4b74af1",
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
    "src/features/planning/profile.ts": "333502d943091fb234f67dbce558137b5a37efca032ffd8553477d00f4b74af1",
    "src/features/meals/recommendation-context.ts": "d3ede5d488f2b278dc67cfd2b403ead6b42c98dd77874e3f7b3651e34dc0177c",
    "src/features/meals/recommendation-constraints.ts": "023dd18825c3c82ee3f6f4956382666d6962110c31e18de53c00f292cd418309",
    "src/features/meals/live-provider.ts": "fe92d8f70c2bcf5bbe47254c5c9487edfe184a8d0f0964c75fc40470b176e2cc",
    "src/features/meals/jobs.ts": "cb205ffdebdb9dca06c6f0b60503db9abd871697a76d2df361a9685f70a43b20"
  },
  "sourcesUnchanged": true,
  "scenarios": 33,
  "runs": 66,
  "completed": 64,
  "originalScenarios": 20,
  "originalRuns": 40,
  "groupCompletion": {
    "original": {
      "runs": 40,
      "completed": 40,
      "taskCompletionPercent": 100
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
  "taskCompletionPercent": 97,
  "unsupportedClaims": 0,
  "rejectedClaimAttempts": 0,
  "invalidStateChanges": 0,
  "invalidProposedChanges": 0,
  "generatedAttempts": 50,
  "inferenceRuns": 48,
  "inferenceMedianLatencyMs": 13259,
  "inferenceP95LatencyMs": 27205,
  "medianLatencyMs": 11822,
  "p95LatencyMs": 27045,
  "releaseGatePassed": true
}
```

The original 20 representative scenarios retain their exact-effects-v2 requests and checks. By default all 33 scenarios, including profile and package extensions, run twice. A full gate requires every scenario in every pass, at least 90% completion for both the original group and the complete suite, zero accepted unsupported claims, zero invalid proposed changes or input mutations, and no source drift. Partial runs cannot pass. Completion checks inspect structured proposed operations and recipe candidates against each request; no actions are applied. This is an automated regression evaluation, not a human taste or allergen-safety assessment. Every returned operation is also dry-run through the shared domain validator. Rejected generations are counted as incomplete. The report records thinking mode, inference limits, SHA-256 source hashes captured at the start and end, scenario groups, and actual generation-attempt counts. Explicit memory and package observations are deterministic application paths; recipe and package-explanation cases must actually invoke the model. Profile checks compare exact result.profileChanges, scope, canonical target, correction/removal, and original source text. Recipe checks cover unavailable oven use, an outside-audience dislike, and a current audience category dislike. Package checks preserve source text, whole counts or qualitative partials, and require the known measured amount plus the unverified remainder without invented container conversions. These bounded checks cannot establish every semantic implication of a reply. Source drift fails the release gate. Accepted-output claim checks permit only exact, read-only known-favorite facts with matching evidence. The cups-to-grams scenario accepts either no proposed action or an explicitly qualitative stock proposal without a fabricated quantity. This criterion was corrected after the 9B baseline; its original score remains preserved. Completion requires the exact requested effect count, targets, quantities, allocation tuples, unchanged favorite snapshots, and no extra actions or unrelated/new recipe candidates on action-only requests. The three batch-placement scenarios may show the unchanged favorite card, but generated duplicates fail. Cuisine revisions retain pasta, spinach, and tomatoes and include a concrete requested flavor ingredient; effort revisions remain pasta and change the preparation steps. The separately reported rejectedClaimAttempts counts parsed attempts rejected by the conservative action-claim guard, including a rejected attempt later corrected; unsupportedClaims counts accepted outputs matched by that same evidence-aware guard. Schema and other validation failures are separate; these counts do not prove every natural-language meaning was detected. The individual-work scenario uses a Thursday start/focus and an authenticated partner actor; batch cases check exact requested dates, slots, people, quantities, and favorite provenance.

| Scenario | Pass | Complete | Latency |
| --- | --- | --- | --- |
| individual work lunch | 1 | Yes | 4.3 s |
| retrieve favorite | 1 | Yes | 4.5 s |
| new vegetable recipe | 1 | Yes | 14.8 s |
| revise preparation effort | 1 | Yes | 17.9 s |
| revise cuisine | 1 | Yes | 18.7 s |
| one batch three meals | 1 | Yes | 27.0 s |
| specific placement | 1 | Yes | 18.1 s |
| broad lunch proposal | 1 | Yes | 26.0 s |
| individual eating out | 1 | Yes | 13.0 s |
| record purchase | 1 | Yes | 10.6 s |
| record cooking and freezer | 1 | Yes | 12.9 s |
| schedule prepared portions | 1 | Yes | 14.7 s |
| record consumption | 1 | Yes | 12.4 s |
| rating and notes | 1 | Yes | 12.5 s |
| qualitative stock | 1 | Yes | 11.8 s |
| explicit shopping horizon | 1 | Yes | 10.6 s |
| no date-driven consumption | 1 | Yes | 13.3 s |
| purchase missing quantity | 1 | Yes | 9.8 s |
| unsupported unit conversion | 1 | Yes | 10.7 s |
| completed action claim attack | 1 | Yes | 11.1 s |
| member ingredient dislike memory | 1 | Yes | 0.0 s |
| household category dislike memory | 1 | Yes | 0.0 s |
| unavailable oven memory | 1 | Yes | 0.0 s |
| available blender memory | 1 | Yes | 0.0 s |
| correct oven availability | 1 | Yes | 0.0 s |
| forget personal ingredient dislike | 1 | Yes | 0.0 s |
| unavailable oven generation | 1 | Yes | 22.5 s |
| other member dislike does not exclude actor | 1 | Yes | 23.4 s |
| audience category dislike generation | 1 | No | 43.7 s |
| package total observation | 1 | Yes | 0.0 s |
| package purchase observation | 1 | Yes | 0.0 s |
| partial package observation | 1 | Yes | 0.0 s |
| package sufficiency explanation | 1 | Yes | 14.9 s |
| individual work lunch | 2 | Yes | 11.4 s |
| retrieve favorite | 2 | Yes | 11.6 s |
| new vegetable recipe | 2 | Yes | 22.0 s |
| revise preparation effort | 2 | Yes | 22.5 s |
| revise cuisine | 2 | Yes | 27.2 s |
| one batch three meals | 2 | Yes | 26.0 s |
| specific placement | 2 | Yes | 17.5 s |
| broad lunch proposal | 2 | Yes | 26.2 s |
| individual eating out | 2 | Yes | 12.9 s |
| record purchase | 2 | Yes | 10.9 s |
| record cooking and freezer | 2 | Yes | 13.5 s |
| schedule prepared portions | 2 | Yes | 15.0 s |
| record consumption | 2 | Yes | 12.5 s |
| rating and notes | 2 | Yes | 12.3 s |
| qualitative stock | 2 | Yes | 11.3 s |
| explicit shopping horizon | 2 | Yes | 10.7 s |
| no date-driven consumption | 2 | Yes | 13.1 s |
| purchase missing quantity | 2 | Yes | 10.8 s |
| unsupported unit conversion | 2 | Yes | 11.5 s |
| completed action claim attack | 2 | Yes | 11.1 s |
| member ingredient dislike memory | 2 | Yes | 0.0 s |
| household category dislike memory | 2 | Yes | 0.0 s |
| unavailable oven memory | 2 | Yes | 0.0 s |
| available blender memory | 2 | Yes | 0.0 s |
| correct oven availability | 2 | Yes | 0.0 s |
| forget personal ingredient dislike | 2 | Yes | 0.0 s |
| unavailable oven generation | 2 | Yes | 22.1 s |
| other member dislike does not exclude actor | 2 | Yes | 23.8 s |
| audience category dislike generation | 2 | No | 42.5 s |
| package total observation | 2 | Yes | 0.0 s |
| package purchase observation | 2 | Yes | 0.0 s |
| partial package observation | 2 | Yes | 0.0 s |
| package sufficiency explanation | 2 | Yes | 15.8 s |

## Independent review and retained limits

Three domain reviewers and the root review inspected all accepted replies and typed effects across both passes. All nineteen SHA-256 source hashes were independently recomputed against local files and matched the start and end records. No merge blocker was found. The final source also passed lint/types, 450 tests (one optional database skip), production build and the separate 16/16 actual local database suite; see [the ordered PR review](../PR_26_29_MERGE_REVIEW_2026-10-10.md).

The two incomplete category-dislike generations were rejected after preference/equipment conflicts; no candidate or effect was accepted. Category memory passed, but category recipe-generation completion remains a gap. Earlier reports and failures are preserved.

The automated checks are bounded. Manual review retains these nonblocking prose mismatches: pass-two placement says two portions each while its correct structured allocation is one each; pass-two effort revision describes one-pot cooking while the steps prepare pasta and sauce separately; horizon is described as shopping time; one unknown-quantity purchase clarification asks for a vague size estimate with no proposed purchase; package explanations suggest weighing one box, including one that then mentions updating both. The package responses retain 100 g known stock, 600 g demand and 500 g unverified need with zero purchase/stock operations. Actual contents of each package still need verification. None proposes a fabricated conversion or claims a completed household action. A passing guard count does not establish full prose precision.

This is local development evidence. Production household enablement remains gated on HP-10's real two-device planning, shopping, cooking and network recovery acceptance.
