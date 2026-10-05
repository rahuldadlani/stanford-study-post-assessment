# Juniper Salon simplified implementation plan

Status update: v2 implementation is now present. This document retains the design/build plan; consult [acceptance evidence](evidence/acceptance.md) for current verification and remaining pre-packaging work.


This plan implements [the customer requirements](design-decisions.md) using the existing starter. The selected frontend is HTML, CSS, and plain JavaScript. Retain the salon coordinator and one Workflow per opening from [the architecture review](temporal-architecture-review.md). Application implementation has not started.

## Runtime architecture

Keep three existing components: Express serving pages and JSON on localhost:3000, one TypeScript Worker executing both Workflow types and Activities, and the local Temporal service with its persistent volume. Temporal UI remains on port 8233.

Use one npm project and the existing startup command. No React, Vite, frontend build pipeline, additional Python service, or separate application database is needed. Native browser modules and fetch handle UI interactions.

## Flat file layout

```text
src/
  api.ts             Express routes, input validation, static serving, startup
  worker.ts          Register both Workflow types and Activities
  workflows.ts       Workflow bundle exports
  salon.ts           Coordinator state, atomic decisions, pending effects, rollover
  opening.ts         Outreach sequence and durable waits
  activities.ts      Coordinator calls, opening launch, simulated delivery
  messages.ts        Typed Signal, Query, and Update definitions
  types.ts           Business records and command/result types
  rules.ts           Pure matching and transition helpers
  access.ts          Staff sessions and private offer tokens
  seed.ts            Fictional waitlist and explicit demo configuration

public/
  index.html         Staff dashboard with detail panels, waitlist, simulated inbox
  offer.html         Private mobile client page
  styles.css         Shared responsive styling
  api.js             Fetch helper and consistent error handling
  staff.js           Staff interactions and rendering
  offer.js           Client responses and final states

tests/
  rules.test.ts      Eligibility and business rules
  workflows.test.ts Coordinator, opening, concurrency, and recovery scenarios
  api.test.ts        Access boundaries and request/result behavior

scripts/
  dev.mjs            Existing supervised startup
  smoke.mjs          Integrated demo check

docs/                Requirements, research, and this plan
evidence/            Demonstration results
compose.yml          Existing Temporal service and volume
package.json
package-lock.json
tsconfig.json
.env.example         Local configuration without secrets
```

Keep short routes in api.ts and Activities together. Extract modules only when their contents become difficult to understand or test. Browser code must never import Temporal or server runtime modules. Pure rules accept time and IDs explicitly.

## State and responsibility

The coordinator owns waitlist order, openings, active offers, client claims, fulfilled entries, booking outcomes, simulated messages, deduplication, and pending effects. Each opening record contains its offers, timeline, and optional booking; separate repositories and service layers are unnecessary for this bounded prototype.

Opening Workflows own process execution. Their snapshots cannot independently authorize acceptance or release claims. Activities perform coordinator requests and delivery. Authoritative data must never live only in API or Worker process memory.

Coordinator commands register openings, reserve the next eligible client, record delivery outcomes, accept/decline/expire offers, and cancel outreach or confirmed bookings. Check and update shared records in synchronous handlers with no await inside the critical transition. Process slow effects afterward.

Pending effects are a fixed set of launch, wakeup, and notification records, not a generic job framework. Stable operation IDs make retries safe. Activities call coordinator Updates when a result is needed; Signals wake opening Workflows after a response, cancellation, or eligibility change.

## Simulated messaging

Implement simulation directly in activities.ts. Record simulated inbox messages durably through coordinator commands using stable notification IDs. Retrying must not duplicate a text, and restarting the Worker must not erase the inbox. Include clearly labeled delivery failure controls for demonstration.

A real SMS adapter can be extracted later, when a provider is chosen. The prototype must not claim to have sent a real text. Confirmation and cancellation messages must remain ordered per booking, and failed confirmation delivery must not silently undo a booking.

## Two page interface and small API

The staff page has an opening form, opening list, selected timeline, waitlist, and simulated inbox as panels or tabs. The client page shows only its offer, deadline, accept/decline buttons, and final status. Use HTML forms, small rendering functions, and shared CSS. Render client-provided strings safely as text.

| Route | Purpose |
| --- | --- |
| POST /api/staff/session | Establish a local staff session |
| DELETE /api/staff/session | End the session |
| GET /api/staff/state | One bounded snapshot of openings, waitlist, timelines, and messages |
| POST /api/staff/openings | Register an opening |
| POST /api/staff/openings/:id/cancel | Stop outreach or cancel its booking |
| GET /api/offers/:token | Return only the authorized offer |
| POST /api/offers/:token/respond | Accept or decline and return the authoritative result |

Keep server-side staff access checks and scoped client tokens. A hidden staff link is not access control. Public responses omit other clients and internal errors. Staff access is a simple local prototype mechanism, not a production identity system.

Refresh visible data periodically and after actions; stop polling when unnecessary and show connection failures. Countdown displays are informational. Temporal owns expiration and progression even when browsers are closed. API timeout during acceptance means the outcome is uncertain: recover using the same operation ID or a status read.

## Guarantees retained

- One active offer per opening and client across all openings.
- Acceptance books the opening and fulfills its waitlist entry together.
- A normal 15-minute same-day response window and automatic progression.
- Duplicate requests and stale links cannot create another booking.
- Staff cancellation before and after acceptance, with clear client notification.
- Durable pending launches and notifications, plus recovery after Worker restart.
- Continue-As-New preserves active state, deadlines, pending work, and deduplication while bounding coordinator history.
- Useful staff history, failure visibility, and private client responses.

## Build order and checkpoints

1. Verify the starter tests, a coordinator Update on the local server, and one-command startup.
2. Implement records, matching, and coordinator commands. Test competing openings, fulfilled entries, duplicate requests, stale expiry, and acceptance/cancellation races.
3. Connect one opening Workflow, simulated delivery, and both HTML pages. First review checkpoint: create an opening, accept through a private link, and see matching confirmation on both pages.
4. Add decline, timeout, delivery failure, exhaustion, and cancellation. Verify pending-effect retries, Worker restart, Continue-As-New with an active offer, and progression with every browser closed.
5. Polish mobile layout, history, errors, and labeled demo timing. Run tests, typecheck, API/privacy checks, and a smoke demonstration; document results.

Retain npm run dev, npm test, npm run typecheck, and npm run stop. Add a smoke command; a frontend build command is unnecessary. Never clear Temporal's persistent volume during normal startup.

## Proposed defaults and remaining details

These defaults are separate from Lena's confirmed requirements:

- One configured salon timezone and concrete sample availability windows.
- Joined-at followed by entry ID resolves ordering ties.
- If every remaining candidate is temporarily claimed elsewhere, wait for eligibility to change until the appointment cutoff. Do not report exhaustion prematurely; ensure the wakeup is not lost between the check and wait.
- Expiry is capped at appointment start. Fix when the 15-minute window activates before implementing delivery and acceptance; cover early responses and delayed delivery results.
- Decline, timeout, delivery failure, or canceled outreach releases an entry for other openings, but never repeats that opening's offer to the same entry.
- Canceling a confirmed booking does not automatically rejoin the client to the waitlist.
- Short demo deadlines require an explicit label; normal timing remains 15 minutes.

## Completion evidence

Demonstrate booking, automatic progression, delivery failure, cancellation before/after acceptance, competing openings, duplicate/expired responses, privacy, and Worker restart recovery. The smaller codebase must still pass these behavioral checks.
