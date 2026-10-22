# Alex's product outcome contract — v2, October 21, 2026

This contract implements Nate's stated product philosophy. It is an ambition and evaluation method, not a claim that 10× performance or adoption has been demonstrated. The October 19 61/100 usability assessment remains a historical v1 diagnostic. No time, cooking or savings baseline was collected in that assessment.

## Priority order

1. **Save time, effortlessly.** Make deciding, checking what is at home and getting a trustworthy grocery list so much easier that the user wants this to be their normal way. The target is a **10× time advantage on the defined Friday job**, with intuitive first use and little ongoing upkeep. More features, more recipes and fewer clicks alone do not establish it.
2. **Make home cooking easier.** Help people cook meals they enjoy from real ingredients more often, in their own terms. Support practical preferences, convenience and leftovers. Do not impose healthy-meal goals, nutrition targets, food morality or an exhaustive profile. Frozen pizza and meals out remain valid choices.
3. **Save money and reduce waste.** Help use food already at home and use perishables while they are still useful. Demonstrate avoided unnecessary purchases or discarded food where evidence exists. Cheaper ingredients, retailer comparisons and price optimization remain possible future directions, not new scope or implied capabilities.

Treat this as a hierarchy, not an average: cooking or money benefits cannot offset a slower, confusing core workflow. When tradeoffs matter, explain them and respect the user's choice. Correctness, constraints and user control remain mandatory; speed achieved by an unusable list does not count.

## Define the user's alternative

Before a timed comparison, record what this person actually does without LunchBox: memory, cupboard checks, recipe sites, saved recipes, chat tools, notes, a grocery app or a combination. This is the adoption baseline. The prior LunchBox UI and competitor feature lists are diagnostic comparisons, not substitutes for the user's actual alternative.

Predefine the completed job and quality floor for both methods. For the Friday case, this normally means wanted recipes, agreed total portions and one actionable combined grocery list using existing food where known. Do not require calendar dates unless the user wants them. Match audience, constraints, recipe/meal complexity, starting stock knowledge and required output. Do not make LunchBox's trial easier by supplying a completed pantry or requiring the baseline to schedule unwanted dates.

Record paired runs and sample size. Use comparable, initially unfamiliar tasks or account for order/practice effects; a remembered recipe on the second run is not a product improvement. Keep raw times, unsuccessful attempts and variation visible. Three observed sessions can calibrate the protocol; they do not establish broad adoption or a population-wide 10× claim.

## Measure time without hiding work

The main clock begins when the person decides to solve the meal-and-shopping job, before entering any app or starting required setup. It ends when the result can actually be used with the agreed quality. Include searching, thinking, typing, pantry checking, inventory entry, AI waits, retries and necessary correction; include every household member's required active effort. Record elapsed time and total active person-minutes separately. Mark unrelated interruptions consistently for both methods.

An unresolved stock check may be useful intermediate output, but do not stop the product clock while a required cupboard check, quantity correction or list assembly still stands between the person and a usable shopping list. If the task intentionally ends with a check list, use that same endpoint and uncertainty standard for both methods and label the narrower result. The original Meals & Plan timers remain submetrics, not the product clock.

Report first-use and returning-use results separately. First use includes required onboarding and data entry. Returning use includes actual pantry upkeep, purchase/cooking logging, reconciliation and recovery attributable to the job. If setup is amortized, show its original cost, observed reuse count and separate payback; do not assume months of future use. Never conceal a slow first session behind a fast returning session.

For matched successful runs:

- **Time advantage = baseline elapsed minutes / LunchBox elapsed minutes.** 10× means one tenth the time, a 90% reduction, not an extra 10% improvement.
- **Time saved = baseline elapsed minutes − LunchBox elapsed minutes.** Also show the active-effort difference. A fast elapsed run bought with more household labor is not effortless.
- **Example target, not an observation:** a 30-minute existing routine versus three minutes in LunchBox at equal quality is 10× and saves 27 minutes. A two-minute UI flow plus eight minutes of required pantry entry is ten minutes total, only 3× against that baseline.

Report repeated matched results and their variability, not just the best run. State the task and cohort/household scope of any ratio. Do not report a ratio for failed or lower-quality outputs, mix first-use and returning-use denominators, or generalize a planning result to total time spent feeding the household.

Track downstream shopping, active preparation and cleanup when they change. A shorter planning session that creates substantial extra cooking work has shifted effort. Show that separately before claiming an overall time saving; the user may still choose the meal.

## Test effortless, intuitive use

Observe a first visit without coaching or an external instruction sheet. Can the person find a useful starting point, understand the next action and complete the agreed job without understanding modes, stages, schemas or a calendar model? Record hesitation, backtracking, unnecessary questions, repeated entry, facilitator rescue and parallel notes/calculations. Fewer controls only help if the next useful action remains discoverable.

Ask whether the result fits and whether they would choose this method next time; record their actual answer. Then observe voluntary return and completed use across real planning/shopping cycles where available. A simulated Alex reaction, a stated preference or one fast task does not prove habit or adoption. “I can't imagine doing it another way” is the aspiration; never manufacture the quote.

## Track secondary outcomes honestly

| Outcome | Useful evidence | Insufficient evidence |
| --- | --- | --- |
| Home cooking from real ingredients | Comparable real periods: meals actually prepared/eaten, ingredients used, effort and enjoyment/make-again feedback; user-defined starting routine and whether LunchBox helped | A recipe generated, a meal scheduled, a healthy label, or a portion assumed eaten |
| Use existing food and waste less | Existing/perishable ingredients actually used, discarded amounts/reasons before and during use, and whether required upkeep undermines convenience | A use-soon badge or a pantry item merely included in an unmade recipe |
| Spend less | Observed unnecessary purchases avoided or comparable food spending for similar meals/portions; disclose extra ingredients, leftovers, app costs and changed shopping/preparation effort | Missing-ingredient counts treated as prices, full pantry value called savings, or guessed retailer prices |

Report measured outcomes, estimates/assumptions and potential benefits separately. Keep lack of evidence as unmeasured, not zero. Do not double-count the same food as both avoided waste and an avoided purchase. Changing household size, occasions, food choices or meal portions can explain spending differences; do not automatically credit LunchBox. Defer cost/price claims when evidence is missing.

## Product verdict, separate from interface score

Report the time result as **10× target demonstrated for the observed task**, **time saved but below 10×**, **no time saved/regression**, or **unmeasured**. Report intuitive use as **observed pass**, **friction/blocker**, or **unverified**. A demonstrated ratio alone cannot pass effortless use if the trial needed coaching, hidden upkeep or parallel planning.

Reserve “the 10× Friday promise is demonstrated” for repeated comparable successful runs at at least 10×, intuitive unassisted use, acceptable ongoing burden and no displaced-work/correctness blocker, scoped to those observations. If only returning use meets it, say so and expose first-use/payback. An 85/100 or higher usability score is useful diagnostic evidence; it cannot supply the missing outcome proof. Home cooking and money outcomes follow as separate secondary measures, never compensation for a failed primary result. HP-10 release gates remain independent.

Every feature review should answer: **Whose time does this save, which chore or decision disappears, what new upkeep does it introduce, and what evidence would show someone chooses it again?** Identify a small next experiment when evidence is missing; useful work can continue while the product promise remains unproven. No new analytics, price service, nutrition system or background monitor is authorized merely by this measurement contract.
