# Juniper Salon submission guide

## Demonstrate the customer value

“Juniper helps Lena and Carla fill last-minute openings without repeatedly checking a spreadsheet and texting each person. It contacts one suitable client at a time and makes acceptance safe across competing openings.”

1. Start Docker Desktop and `npm run dev`. Open localhost:3000; staff password is `juniper-demo` unless overridden.
2. Add a same-day haircut. Point out service, stylist, appointment time and the sequential offer history.
3. Open a simulated text in a separate tab. The client sees only their appointment, with no account or waitlist details. Accept, then return to the front desk: booked, one confirmation, and a reminder to update the real calendar.
4. Cancel the confirmed booking. The client link now shows unavailable and a cancellation message is recorded.
5. For a quick failure demonstration, create another opening with 10-second demo offers and simulated first-delivery failure. The history should show the delivery failure, then timeout, and the next offer automatically. Decline or accept that offer.
6. Show the completed opening in Temporal Web UI on localhost:8233. Explain that the opening Workflow owns durable waiting; the salon coordinator serializes client claims and booking decisions; both survive Worker restart.

Four fictional clients are seeded. Booked clients remain fulfilled even if staff later cancel. To start another demonstration without deleting existing history, stop the app and use `SALON_WORKFLOW_ID=salon/juniper-v2-demo-2 npm run dev`.

## What has been verified

- 18 local rule/access tests passed.
- Seven real Temporal/HTTP integration tests passed, including Worker stop/restart, Continue-As-New, concurrent openings, repeated acceptance, failure progression, privacy, and cancellation after Workflow completion.
- The visible-app smoke passed and recorded a real completed opening for Maya Chen.
- Type checking, Workflow bundling, and browser-JavaScript syntax checks passed.

See [every acceptance criterion](evidence/acceptance.md), [verification output](evidence/verification.json), and [representative smoke output](evidence/first-slice-smoke.json). The verification source hash matches the packaged application code.

## Finish before submission

- Review the staff and client pages at desktop and phone width. This visual check has not been independently completed by the agent.
- Capture `evidence/temporal-workflow.png` following [the starter’s screenshot requirement](../evidence/README.md).
- Publish only to `rahuldadlani/stanford-study-post-assessment`. Confirm GitHub shows **Public** and does not say **forked from**. Do not add the starter owners as collaborators.
- Keep `.juniper-secret`, `.env`, `node_modules`, local Temporal data, and unrelated course files out of the submission. The source archive is built from tracked Git files, with dependencies installed by the reviewer using `npm ci`.

## Scope to explain honestly

This is a local prototype with sample availability, stable fictional client IDs, a haircut-only catalog, and explicitly simulated texts. Real Google Sheets import, live SMS delivery, payments, and calendar replacement are outside scope. Normal offers last up to 15 minutes; the 10-second setting is a labeled demo option. Temporarily busy clients are skipped, exhausted openings end unfilled, and cancellation does not automatically re-enroll booked clients. Those rules are recorded as prototype assumptions where Lena did not specify them.
