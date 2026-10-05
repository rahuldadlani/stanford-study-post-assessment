# Juniper Salon prototype requirements and design decisions

This document is the working reference for building the local Temporal assessment prototype. It records Lena's confirmed requirements, the implementation direction discussed with Rahul, and assumptions that still need validation. Use it when designing, implementing, and reviewing the prototype; update it when new customer decisions change the behavior.

Source: Lena's initial customer conversation and follow-up answers supplied by Rahul in this working session. These requirements describe intended behavior, not features already implemented in the starter.

## Business goal

Juniper Salon experiences roughly 8–12 cancellations within 48 hours each week. Lena and Carla currently scan a Google Sheet and text clients who requested an earlier appointment. The goal is to fill more last-minute gaps with less manual follow-up. Safe, automatic progression through the waitlist matters more than contacting everyone at once.

Lena's priority: “The important part is that it moves on by itself while preventing two people from claiming the same opening.” No numerical improvement target has been agreed.

## Confirmed customer requirements

### Matching and ordering

- Staff enter an open appointment.
- Eligible clients must match the service, be available at the appointment time, and meet any required stylist preference.
- Among eligible clients, the entry that joined the waitlist earliest gets the first offer.
- A client must not receive competing offers at the same time, including offers from different openings.
- Accepting an offer fulfills that waitlist entry; it must no longer be considered for other openings.

### Offers and responses

- Offer each opening to one eligible client at a time.
- For a same-day opening, allow 15 minutes to respond.
- A decline, timeout, or delivery failure advances the process automatically to the next eligible person.
- Stop when no eligible candidates remain. Staff must be able to understand why the process ended.
- Accepting immediately confirms the appointment and prevents anyone else from claiming that opening. No additional staff approval is required.
- Staff update the real appointment calendar afterward.
- Repeated clicks must not create multiple bookings.
- Expired or stopped offers show that the opening is no longer available and direct the client to contact the salon.

### Staff controls and visibility

- Lena and Carla enter and monitor openings.
- Staff can see who currently holds the offer, who declined, who timed out, which deliveries failed, and the final outcome.
- Staff can stop outreach if the original client returns or the stylist or appointment becomes unavailable.
- Staff can cancel after acceptance, with a clear notification to the client.
- The client and front desk both learn when an opening is filled.

### Client experience and privacy

- Clients receive a simple phone link to accept or decline; no client account is required.
- Each client sees only their own offer, with no other clients' information or full waitlist position.
- The interface should feel warm and calm on a phone. Staff-facing business status should also use plain language.
- Text is the existing communication channel. A phone link or clearly labeled simulated text is acceptable for the prototype.

### Existing data and boundaries

The Google Sheet currently holds client name, mobile number, requested service, preferred stylist, and general availability. Earliest-first ordering also requires a reliable joined-at value or an agreed import order; Lena has not specified how that is recorded today.

Payment processing and replacing the salon's calendar are outside scope.

## Proposed prototype scope and interface

These are implementation choices discussed in this session, rather than additional customer requirements:

- Run locally using the supplied TypeScript API, Worker, Temporal server, and browser starter.
- Use HTML, CSS, and plain JavaScript served by Express, with one staff page and one private client page. The simplified implementation plan replaces the earlier React and Vite proposal.
- Begin with same-day openings. Rules for openings on later days remain unspecified.
- Use sample waitlist data and clearly labeled simulated texts. Live Google Sheets synchronization and real SMS delivery are deferred.
- Keep the normal offer duration at 15 minutes. A clearly labeled demo mode may shorten it to demonstrate timeouts.
- Provide a staff dashboard for entering openings, viewing progress, and canceling.
- Provide opening details with the current offer and a chronological activity history.
- Provide a private client page with appointment details, accept/decline actions, and confirmation or unavailability messages.
- Keep cancellation of a confirmed booking available after the offer-filling Workflow has completed.

## Temporal and shared state design

Selected high-level architecture: a salon-wide Entity Workflow owns shared decisions, alongside one Workflow per opening. Following the idle-cost discussion, retain the coordinator while idle and bound its history with Continue-As-New. The [Temporal architecture review](temporal-architecture-review.md) records the alternatives and all 35 catalog patterns; the [codebase implementation plan](implementation-plan.md) proposes the framework, file layout, and build sequence. The expanded v2 prototype is implemented. Rahul authorized continuing after the first-slice handoff. Local tests, type checking, Workflow bundling and all seven real Temporal/HTTP integration scenarios pass, verified from the user-run evidence with a matching source hash. The visible-app smoke also passed. Desktop/mobile visual review remains pending. The user-captured Temporal UI screenshot is included under `evidence/temporal-workflow.png`. See [the current acceptance evidence](evidence/acceptance.md) before packaging.

Use one Temporal Workflow per opening to coordinate candidate selection, offer delivery, waiting for a response or deadline, and progression to the next candidate. External actions such as messaging and database writes belong in Activities. Use Temporal's durable waiting and recovery meaningfully rather than implementing the offer deadline only in the browser or an API process timer.

Temporal preserves Workflow execution history and reconstructs progress after a Worker restart. The salon coordinator will enforce rules spanning multiple Workflows using durable state. A transactional database accessed through Activities remains a future alternative, rather than an additional booking authority in this prototype.

The implementation must preserve these invariants:

1. An opening has at most one confirmed booking and one active offer.
2. A client has at most one active offer across openings. The client identity model must also prevent duplicate waitlist rows from bypassing this rule.
3. Selecting a candidate claims them atomically; concurrent Workflows cannot both acquire the same client.
4. Acceptance validates the current offer, deadline, opening availability, and entry eligibility before committing the booking.
5. Booking the opening and fulfilling the entry happen atomically. Retries return a consistent result without duplicating the booking.
6. Cancellation, acceptance, and expiration are ordered consistently in shared state so racing requests cannot produce contradictory final outcomes.
7. Retried Activities do not duplicate business effects. Offer and notification identifiers must support deduplication.
8. Client links authorize access only to that offer. Client responses must never expose staff-only waitlist data.

A Workflow cannot be signaled after it has completed. Post-acceptance cancellation therefore needs a separate application operation. The long-lived salon coordinator owns this operation and atomically records a simulated cancellation notification, even after the opening Workflow has completed. Any earlier confirmation is marked superseded; the private link shows the current canceled status.

## Assumptions to validate

The following rules were proposed during design but were not explicitly confirmed by Lena:

- Stop outreach when the appointment begins; an offer cannot remain claimable after that point. This can shorten the response window below 15 minutes for an imminent appointment.
- After a decline, timeout, delivery failure, or canceled opening, release the entry for other suitable openings. Do not offer that same opening to that entry again.
- Canceling an accepted booking does not automatically put the client back on the waitlist.
- Temporarily busy clients are skipped while other eligible clients are considered. What to do when all otherwise suitable clients hold other offers—wait for availability or finish unfilled—remains unresolved.

## Explicit v2 prototype assumptions

These choices keep the local demonstration concrete; they are not additional statements from Lena:

- Salon timezone is America/Los_Angeles; the time-entry control uses the device timezone. Availability covers the full appointment duration. The initial catalog is haircut appointments with Elena or Theo.
- Four fictional clients have precise seven-day availability windows, joined-at timestamps, and stable client IDs. Imported real data would need a reliable identity mapping and availability conversion. Duplicate rows with the same client ID cannot bypass reservation or fulfillment.
- Clients with active offers elsewhere are skipped; if no currently eligible client remains, the opening ends unfilled rather than waiting for a release. A client is never contacted twice about the same opening.
- Cancellation after booking does not automatically re-enroll the client.
- Offer time starts when the simulated message is durably recorded and is clipped to appointment start. Staff can explicitly enable a labeled 10-second timeout demonstration.
- The “fail first delivery” demo control represents a permanent delivery failure. There is no live SMS provider or Google Sheets sync. Durable simulated notification records are committed synchronously with the business outcome; there is no later confirmation-send queue to overtake cancellation.
- The staff dashboard is the front-desk notification surface. Client links use a random signing key persisted locally; staff use a password/session on the loopback app.
- Continue-As-New bounds execution history; the demo also caps its retained state at 100 openings. A larger deployment would need an external archive/data-retention policy.
- v2 uses a fresh fictional salon and task queue. The earlier v1 histories and Workflow definitions are retained; no live customer-data migration is implied.

## Details still to resolve

- How general availability becomes precise matching rules, including salon timezone and appointment duration.
- How earliest-first ordering is established for existing Sheet rows and ties.
- Whether stylist preferences can be optional as well as required, and how staff distinguish them.
- How clients are identified across duplicate entries or multiple requested services.
- How long messaging retries last before an offer is marked undeliverable, and whether its deadline starts on creation or successful delivery.
- How front-desk notifications and staff access are represented in the local prototype.
- The outcome of canceling a booking while its confirmation notification is pending, so the client receives an accurate final message.

Resolve these through explicit implementation assumptions or follow-up answers; do not silently represent them as customer decisions.

## Acceptance scenarios for implementation

These are the complete target checks derived from the requirements. Current implementation and verification status is tracked in [the evidence matrix](evidence/acceptance.md); this list itself does not claim that checks pass.

| Scenario | Required outcome |
| --- | --- |
| Several eligible clients | Earliest eligible entry receives the sole active offer. |
| Service, availability, or required stylist mismatch | Ineligible entry receives no offer. |
| Current client accepts | One booking is confirmed, entry is fulfilled, staff and client are notified. |
| Decline, timeout, or permanent delivery failure | Reason is recorded and the next eligible client is offered the opening automatically. |
| Repeated acceptance or a retry after a lost response | Same booking result; no duplicate booking. |
| Old link used after progression or cancellation | No booking; clear unavailability message and salon contact direction. |
| Two openings select the same client concurrently | Only one acquires the client and creates an active offer. |
| Acceptance races with cancellation or timeout | One consistent final outcome; no double-booking or stale acceptance. |
| Worker restarts during a wait | Workflow resumes with the original deadline and offer history. |
| Staff cancel before acceptance | Active offer becomes unavailable and further outreach stops. |
| Staff cancel after acceptance | Booking is marked canceled and the client is clearly notified. |
| No candidates remain | Staff see an unfilled outcome and the attempt history. |
| Client opens their private link | Only their own offer is accessible; no waitlist or other client details leak. |

## Repository reference

Starter source: `https://github.com/john-b-yang/temporal-waitlist-assessment-starter`.

Submission destination: `https://github.com/rahuldadlani/stanford-study-post-assessment`.

Push assessment work only to the submission destination. The assessment requires a public repository outside GitHub's fork network; do not add the starter owners as collaborators. Public visibility and fork status still need verification before submission.
