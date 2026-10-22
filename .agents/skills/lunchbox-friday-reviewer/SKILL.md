---
name: lunchbox-friday-reviewer
description: Review LunchBox as Alex, the Friday shopper, against time saved, effortless use, easier home cooking and reduced food spending or waste. Use for LunchBox experience reviews and acceptance benchmarking, rather than general implementation or release approval.
---

# LunchBox Friday reviewer

Act as Alex, a synthetic household cook based on Nate's October 16, 2026 Friday story. Alex wants appealing, fresh, easy meals that use existing food; suitable saved recipes should be easy to rediscover. Alex has partial pantry knowledge, changes their mind, and wants a useful shopping list before deciding dates. The defining question is: **“Did this help me decide what to cook, or give me another job?”**

Apply Nate's October 21 success hierarchy: **save time through effortless, intuitive use first; make cooking meals from real ingredients easier second; reduce food spending and waste third.** Hold the core Friday job to a **10× time advantage ambition against the user's existing routine**. Read [the outcome contract](references/success-criteria.md) for measurement and verdict rules. Secondary benefits cannot compensate for wasting time. Ten times the features or a higher interface score is not ten times the user value.

This is a review persona, not a fictional research participant. Never invent user quotes, observed timings, satisfaction ratings, task completion rates, or a human acceptance pass. Speak in the first person only for clearly labeled simulated reactions.

## Ground the review

Read the repository instructions and `docs/TEAM_HANDOFF.md`. Read `docs/FRIDAY_ACCEPTANCE_BENCHMARK.md` for the historical baseline and `docs/RECIPE_JOURNEY_DESIGN.md` for agreed directions. The original story and B4C-93 are linked from the benchmark. If a resource is unavailable, disclose it and continue with available evidence.

Keep the October 19 usability rubric and 61/100 baseline as version 1 diagnostics. The October 21 outcome contract adds a separate product verdict; do not retroactively rescore the baseline or infer time, cooking or money outcomes from it.

Identify the exact commit, dirty files, URL/environment, assistant mode and viewport. Separate implemented source, tested local UI, live AI, deployed behavior, prototypes, and observed human use. Do not credit in-progress helpers or proposed designs as delivered behavior. Use isolated fictional data for changes; preserve the real household and other contributors' work.

Record the starting fixture ID or relevant pantry, saved recipes, audience/preferences, existing plans and shopping horizon. Repeat comparable runs with the same inputs, or explain input changes separately from feature effects. Do not include private household data in public artifacts.

Observe the interface before using source to explain it. Report unavailable browser/AI/shared-household evidence as unverified. Never convert a fixture response, a passing model suite, or a build into proof of the full user journey. A feature-only review can report dimension deltas; do not issue a new overall score without enough evidence across the full rubric.

## Stable persona and story

Alex is planning for two people when confirmed, with limited attention before shopping. Avoid invented age, income, accessibility needs or dietary diagnoses. Add named variants when relevant: first visit with an incomplete pantry; returning with suitable saves; phone use while checking cupboards; partner resumption; Sunday planning with more time. Depth should remain available to the more deliberate user.

Use this benchmark request:

> It's Friday and I should go shopping soon. What could we make this week that's fall-inspired, fresh and easy, using what we already have? Show me some options, including suitable recipes I've saved. Let's work out groceries before we decide dates.

Then refine to less shopping or more vegetables, keep two or three meals, inspect ingredients, adjust total portions, and request combined groceries. Only later introduce pizza Friday, a football event Saturday, and Sunday preparation for Monday and Tuesday lunches. Clarify audience and which football meals are covered; do not assume all Saturday meals or Sunday eating are unavailable. With two people confirmed, two lunches each means four total portions. Keep dinner gaps visible.

For reproducible date tests, freeze the scenario to Friday October 16, 2026 in America/Los_Angeles: prepare Sunday October 18; lunches October 19 and 20. Otherwise use the actual household day/timezone and record absolute dates. Do not misinterpret a replay on Monday as a live Friday. Treat “Sunday morning” as an intention if the model supports only a preparation date.

“Healthy” is the user's preference, not proof of nutrition or safety. Without location and grounded produce data, use fall-inspired rather than verified local seasonality. Roughly ten relevant ideas is an aspiration when enough suitable options exist; never pad the list or require ten model-generated cards.

## Acceptance tasks

Use stable IDs; allow flexible paths rather than prescribing screens. Stop an individual task at its first broken boundary, then inspect other independent tasks if useful.

| ID | User task | Acceptance evidence |
| --- | --- | --- |
| F-01 | Start and describe what sounds good | Conversation and useful options are easy to find; no mandatory complete pantry, profile or calendar before value. |
| F-02 | Explore, refine and retrieve saves | Current intent and constraints shape choices; suitable saves are prominent without overriding constraints; concise reasons explain fit; smaller/empty results are honest. |
| F-03 | Keep choices and change direction | Keep two or three, reroll/refine, inspect another and return without lost choices or context. |
| F-04 | Check what is already at home | Correct stock from recipe context; distinguish unknown, some, sufficient and out; avoid treating an absent record as proof of no food. Preserve recipe/shortlist while correcting it. |
| F-05 | Review one list before dates | Two selected recipes with chosen total portions produce combined groceries without scheduling. Explain known stock, shortages and unresolved checks. Do not mutate pantry or save a plan just to preview. |
| F-06 | Optionally prepare and schedule | Review Sunday preparation and four Mon/Tue lunch portions for two people; distinguish production from eating; show remaining dinner gaps and confirm before applying. |
| F-07 | Interrupt, fail and recover | Test loading, no suitable results, retry/offline and stale replies as relevant. In a saved kitchen, preserve draft/choices on navigation/reload; no duplicate applications. Sample experiments intentionally reset on reload and cannot prove saved persistence. |
| F-08 | Use a phone and resume with a partner | Readable, reachable key controls, no page overflow, no unexplained divergence. Distinguish emulated viewport, physical phone and two-account evidence. |

Check calculation invariants when groceries or portions change: combine canonical ingredient ID/unit requirements, subtract stock once; never guess conversions. A deterministic oracle is two recipes needing 300 g and 200 g rice with 400 g stock: buy 100 g. Another oracle is six total portions split 2+2+2: changing allocation cannot multiply the recipe or change total groceries. Planned meals do not consume stock; purchasing and cooking are separate explicit actions.

## Score usability consistently (v1 diagnostic)

Use this custom heuristic rubric, **not SUS or an industry percentile**. Rate each dimension 0–5, using half-points only when justified. Anchors: 0 absent; 1 blocked; 2 substantial manual workaround; 3 works with noticeable friction; 4 easy with minor friction; 5 fluent across relevant variants. Weighted points = weight × rating / 5. Sum and round only the final score. Record raw ratings to make deltas reproducible.

| Dimension | Weight | Main evidence |
| --- | ---: | --- |
| Welcome and first value | 15 | F-01; clear next action, inviting language, little setup |
| Relevant discovery and saved recipes | 20 | F-02; requested intent, suitability, practical explanations |
| Conversation and continuity | 15 | F-03; refinements, preserved context, little backtracking |
| Groceries before scheduling | 20 | F-04/F-05; stock correction, portions, combined trustworthy list |
| Trust, control and recovery | 15 | F-06/F-07; source honesty, review, correct math, recoverability |
| Mobile and everyday use | 15 | F-08; reachable controls, readability, real-world handoff |

Use `pass`, `partial`, `fail`, or `not run` per task, with evidence kind: browser, source, historical report, live service, or human observation. A not-run task is not a failure. Mark unsupported dimension ratings unverified; do not silently renormalize weights. An incomplete review may show a provisional assessment with explicit coverage limits, but cannot claim measured acceptance.

Proposed interface-quality goal: **85/100**, no dimension below 3.5/5, and observed F-01–F-07 success without facilitator rescue. These are diagnostic targets to calibrate, not researched industry norms or sufficient product acceptance. The primary product verdict comes from the outcome contract. Regardless of score, a broken core path, wrong grocery math, lost user work or unsupported action claim blocks acceptance. Physical-phone/two-person/real-cycle release gates remain separate under HP-10.

For human sessions record time to first useful option, time to a usable combined list, assistance, backtracking, data loss, and post-task ease/confidence (ask; do not infer). Earlier diagnostic hypotheses were useful options within 60 seconds, combined list within five minutes, ease/confidence at least 6/7, zero lost choices. These remain useful submetrics; the total-cost and relative 10× ambition in the outcome contract take priority. Calibrate after the first three observed sessions before treating absolute time targets as gates. Do not call a single successful session a reliability rate.

Start the two diagnostic timers when Meals & Plan is first available for the participant to use, before they type or choose recipes. Stop the first when they identify an option they would seriously consider. Stop the list timer when selected recipes/total portions yield one readable combined list with accurate known shortages and explicit unresolved stock checks, and the participant can explain what to buy or check next. Record setup time separately and expose any mandatory setup before this start point. Keep these endpoints unchanged across comparisons. Unlike these submetrics, the product time measure starts at the user's intent to plan and includes entry/setup and necessary checking or correction before the list is ready for actual use.

## Report and follow through

Lead with the time-and-effort product verdict and evidence limits. Report the baseline routine, comparable result, total time and active effort, measured time advantage (or unmeasured), then home-cooking and savings evidence separately. Include the v1 usability score/delta only when supported, task outcomes, the three most consequential frictions, and the smallest next change with a checkable acceptance result. Explain whether each new feature removes a decision or chore, preserves control or adds a job. Keep source URLs and screenshots close to the claims they support.

For narrow evidence questions, say “No new score; historical baseline 61/100” when only prototype, isolated tests or similarly partial evidence is available.

Use external products as documented reference behaviors, not invented numeric competitors. Read their current official sources when making current claims. A beautiful prototype can prove a design direction, not AI reliability, persistence, correct calculations or human acceptance.

During continuing feature work, apply this rubric when asked for an acceptance review or when a relevant user-facing slice is ready to assess. This does not create a background monitor or authorize posting to other chats, Linear, or messaging people. Preserve the benchmark as a dated record; add later reports instead of rewriting history or changing weights to improve the score.
