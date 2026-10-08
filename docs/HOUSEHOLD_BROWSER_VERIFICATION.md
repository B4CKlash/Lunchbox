# Household pilot browser verification

Verified locally on 2026-10-08 using the actual application UI, local Supabase, and independent browser origins for owner and partner accounts. This is development evidence; a protected hosted preview and the real household shopping/cooking cycle remain separate gates.

## Completed flows

- Conversation and calendar: the authored fixture marks only the requesting person's Tuesday lunch. Vegetables produce an honestly labeled candidate; a quicker revision replaces focus without moving meals. Saving a favorite preserves the recipe snapshot.
- Batches: a six-portion pasta batch covers three two-person occasions. Applying its reviewed proposal counts ingredients once. Removing one person's allocation reduces planned yield, and marking that person's occasion as eating out leaves other allocations intact.
- Purchases: buying pasta then cancelling its uncooked batch leaves the purchased pasta in inventory. Purchases are independent household events.
- Cooking and prepared food: a four-portion batch records actual yield and two frozen portions; allocating a prepared portion to a later date does not create another ingredient requirement. A five-star rating, make-again choice, and cooking notes persist after leaving and returning.
- Uncertain stock: marking tomatoes as “some” produces a stock check rather than an invented shortage. Confirming enough resolves the current requirement. The pantry displays “Some · amount unknown”; the measured-total editor starts blank. Entering the former historical amount explicitly (800 g) restores exact stock rather than silently retaining uncertainty.
- Shared identity: the partner's independent session saw the owner's Tuesday lunch change while its own stayed open (1/28 covered). The partner's own “my Tuesday lunch” then covered only the partner (2/28). Both sessions showed the same saved conversation and calendar.
- Resumption: changing to Local AI and typing an unsent message survives reload, including the selected mode. Composer metadata stays scoped to this browser, account, household and planning session; it does not change the revision of an active AI job.
- Offline and cancellation: stopping the real Mac worker shows “Local AI is offline · request queued.” Cancel request reaches “Request cancelled” with a retry control. Manual inventory changes remain usable.
- Mobile: the conversation, calendar and food/shopping views retain focus at 390×844. No horizontal overflow was found. Reopening one person's meal offers one available portion rather than zero or the whole household. Stock checks remain qualitative.

## Real local AI boundary

A real browser request reached the authenticated Mac worker and returned a saved conversation and reviewable proposal. The initial 9B result correctly identified the owner but proposed Thursday October 8 for a Tuesday request. The review UI exposed this date error, and the proposal was not applied. This was treated as a failed interpretation and added to stricter date/actor evaluation; it is not evidence that the local model release gate passed.

Current quality reports and the final model choice belong in [evaluations](evaluations/) and [the delivery tracker](HOUSEHOLD_PILOT_DELIVERY.md). No inferred cooking or purchasing occurred merely because a date passed or a model claimed completion.

## Evidence and limitations

Local screenshots are retained under ignored `.local/`: `ui-desktop-planning.png`, `ui-mobile-calendar.png`, and `shared-partner-sync.png`. They use development data. Authentication, nonmember access, concurrent writes, stale proposals, lease recovery, duplicate completion, and repeated purchases/cooking are additionally exercised by the focused domain and real local database tests documented in [HOUSEHOLD_SERVER_VERIFICATION.md](HOUSEHOLD_SERVER_VERIFICATION.md).

No production account, inventory, purchase or household calendar was modified. Tests do not replace the users completing a real week together.
