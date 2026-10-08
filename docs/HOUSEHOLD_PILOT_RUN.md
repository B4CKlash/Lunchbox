# Run the real household pilot

This is the remaining household acceptance run, not a record of a completed week. Development fixtures and automated tests are documented separately in [browser verification](HOUSEHOLD_BROWSER_VERIFICATION.md). Use the final protected preview only after the development database, membership, and tested Mac worker are connected.

## Start together

1. Open the protected preview on each person's device. Sign in with separate accounts, create the development household, and join using its partner invitation. Confirm that each account is mapped to the correct person.
2. Review imported pantry data, preferences, recipes, and recovered draft proposals. Keep the recovery copy. Choose a real planning start date and shopping horizon; enter actual equipment and each person's food preferences.
3. Confirm the worker is online and the displayed assistant mode is Local AI. A fixture label means authored examples, not generated advice. Manual planning remains available if the Mac sleeps.

## One planning conversation

Use the household's real dates and meals. Keep all changes in LunchBox so this tests whether a parallel plan is still necessary.

- Mark one person's Tuesday lunch as covered by work. Verify the other person's lunch stays open on both devices.
- Retrieve a favorite, request a new vegetable-focused recipe, and revise its effort or cuisine. Check that discussion alone does not move meals.
- Propose one pasta batch across several occasions. Accept only the placements that fit; compare its yield and shopping preview with the accepted portions.
- Change one person's occasion to eating out. Confirm that the other person's allocation remains and uncooked yield adjusts.
- Record an actual purchase, then cancel a planned meal. Confirm the purchased ingredients remain in inventory.
- Cook a batch and record actual yield and freezer portions. Schedule prepared portions later, without adding the same recipe ingredients to shopping again.
- Record eating, a rating, make-again preference, and cooking notes. Leave and return from both devices; confirm the household context is current.

## Record the outcome

| Evidence | Fill after the run |
| --- | --- |
| Preview commit and URL | |
| Tested model and digest | |
| Actual dates planned | |
| Devices used by both people | |
| Shared changes agreed on both devices | |
| Shopping and cooking completed | |
| Recovery or conflicts encountered | |
| Any need for a separate plan | |
| Friction to fix before production | |

The run passes when both people can plan, shop, cook, and adapt the week comfortably in the application. A successful model evaluation or an authored demonstration alone does not satisfy this gate. Production enablement remains a separate integration action after the recorded outcome is reviewed.
