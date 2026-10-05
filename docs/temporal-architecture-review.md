# Juniper Salon Temporal architecture review

Status: coordinator architecture selected for the prototype after the idle-cost discussion; detailed protocols remain implementation proposals. This review applies Temporal's current design-pattern catalog to the requirements in [design-decisions.md](design-decisions.md). It reviews all 35 listed patterns and cross-checks messaging behavior against the TypeScript guide and the installed SDK declarations. See the [implementation plan](implementation-plan.md) for the proposed code layout and build sequence.

## Recommendation

Keep one Workflow per opening and add one long-lived SalonCoordinator Workflow with the stable ID `salon/juniper`. The coordinator owns the waitlist, active client claims, offer validity, and authoritative booking outcomes across all dates. Opening Workflows own the sequence of work: request an offer, deliver it, wait, expire it, and repeat or finish.

This is our proposed application of the [Entity Workflow pattern](https://docs.temporal.io/design-patterns/entity-workflow). A separate application database is optional for the bounded prototype. Temporal still persists the data in its own backing store; this is not a storage-free design. The coordinator's local variables are reconstructed from its recorded history.

Using a database through Activities is also compatible with Temporal. The choice is about who owns shared business decisions, not whether a database violates Temporal's philosophy.

## Alternatives considered

| Design | Strength | Main tradeoff | Recommendation |
| --- | --- | --- | --- |
| Opening Workflows plus transactional database | Familiar querying, atomic constraints, persistent business records independent of Workflow retention | Additional persistence layer and careful synchronization of Workflow progress with business records | Valid alternative, especially with existing production booking data |
| Coordinator per appointment day | Natural staff view and bounded daily work | Two dates can compete for one client; fulfilled entries must carry across days; midnight is not the waitlist lifecycle boundary | Do not use day as the authority boundary |
| Coordinator per salon plus opening Workflows | Matching and both exclusivity rules can be decided in one place | Coordinator throughput, state size, history rollover, and availability become explicit concerns | Recommended at Juniper's small volume |
| Workflow per client plus Workflow per opening | Naturally distributes client ownership and independent lifecycles | Acceptance spans two authorities, requiring a reservation/commit/cleanup protocol; FIFO matching needs further coordination | Possible later, unnecessary complexity now |

A day-based Workflow could be used later for daily summaries. It must not independently grant offers against the same client pool.

## State ownership

| Component | Owns |
| --- | --- |
| SalonCoordinator | Ordered waitlist and client identity, opening registry, current offer IDs and deadlines, client claims, fulfilled entries, confirmed/canceled booking outcomes, operation deduplication, pending follow-up work |
| Opening Workflow | Durable execution of outreach for one opening, delivery attempts, waiting and timeout wakeups, progression requests |
| Messaging Activities | Calls to the simulated or real messaging adapter, using stable notification IDs |
| API | Staff/client authorization, private offer link verification, input validation, Temporal Client calls, filtered responses |
| Browser | Presentation and user actions; never authority for availability or expiration |

Opening Workflows may hold snapshots, but those snapshots cannot authorize acceptance or free a client claim. All decisions that affect exclusivity go through the coordinator. Matching and claiming happen together, rather than querying for an available client and later claiming them in a second operation.

## Native communication options

Temporal supports direct Workflow-to-Workflow Signals with `getExternalWorkflowHandle(...).signal(...)`. Signals carry durable messages but do not return the receiver's business result. Queries inspect state and cannot claim a client. Updates can mutate state and return a typed result. See the [TypeScript messaging guide](https://docs.temporal.io/develop/typescript/workflows/message-passing).

The installed SDK's `ExternalWorkflowHandle` supports Signals and cancellation, not direct Updates. Two viable coordination approaches are:

1. **Signal request and reply:** an opening sends a request with `operationId` and reply Workflow ID; the coordinator records a decision and Signals the reply. The opening waits on a condition keyed by that operation. Implement deduplication, pending replies, and stale-response handling explicitly.
2. **Activity bridge to an Update:** an opening calls a small Activity, which uses a Temporal Client to execute a coordinator Update and return its decision. Retries use the same business operation ID. This adds Activity scheduling overhead but gives the opening a straightforward request/result interface.

Recommend option 2 for commands such as `reserveNext`, `markDelivered`, and `expireOffer`. Use direct Signals from the coordinator to wake an opening after a client response or staff cancellation. The API sends acceptance, decline, and cancellation Updates directly to the coordinator and uses Queries for staff views. Never create a Temporal Client inside Workflow code.

## Atomic decisions and racing requests

Coordinator handlers perform validation and state mutation synchronously, with no `await` between checking eligibility and changing the related records. [Temporal documents synchronous handlers as atomic](https://docs.temporal.io/handling-messages); async handlers can interleave. External work is queued for the main Workflow loop rather than awaited inside a critical decision.

Proposed acceptance transition:

1. Find the offer by ID and verify the client link's scope.
2. Check that the opening is available, this is its current offer, the client claim belongs to it, and the deadline has not passed.
3. In one handler, mark the opening booked, mark the entry fulfilled, close the offer, and enqueue confirmation work and an opening wakeup.
4. Return the confirmed booking from the completed Update.

The API must wait for Update completion, not merely acceptance by the server, before showing a booking confirmation. If its request times out, the outcome is uncertain; recover using the same operation ID or a status query. Do not create a second booking request with a new identity.

Cancellation, expiration, and acceptance use the same authority and offer ID checks. For a cancellation/acceptance race, processing order determines whether cancellation happens before booking or cancels a just-confirmed booking. Both end states are explicit. A stale expiration for offer A must never release a newer claim for offer B.

Proposed deadline semantics: validity is checked at coordinator processing time, and `now >= deadline` rejects acceptance. A browser click timestamp is not authority. This policy needs to be reflected in the client experience and tested around Worker downtime.

## Opening lifecycle

1. Staff register an opening through a coordinator Update. That transition records the opening and queues its launch.
2. The coordinator durably launches an independent Opening Workflow using a small start Activity and a stable `opening/{openingId}` ID. A retried start attaches to or recognizes the existing execution; it must not recreate a completed opening. An API crash between registration and launch does not lose the launch request.
3. The Opening Workflow calls `reserveNext` through the Activity bridge. The coordinator chooses the earliest eligible unclaimed entry, records the claim, and returns the offer.
4. The opening executes the message Activity and reports success or terminal failure. For success, the coordinator establishes the authoritative deadline; the opening waits on a durable condition with the remaining duration.
5. A decline or acceptance Update changes coordinator state and queues a wakeup Signal. On timeout, the opening requests expiration. The coordinator rechecks the current offer and deadline before releasing anything.
6. After a decline, timeout, or delivery failure, the opening requests its next candidate. After booking, cancellation, or exhaustion, it completes.
7. Staff can later cancel a confirmed booking through the still-running coordinator. It queues a cancellation notification even though the opening Workflow has finished.

Independent opening Workflows avoid tying their lifetimes to a coordinator run. Child Workflows are also possible, but require deliberate Parent Close Policy and Continue-As-New handling. There is no need for a parent-child relationship merely to communicate.

## Recovery and bounded work

These are proposed implementation safeguards, not completed tests:

- Assign stable operation, opening, offer, and notification IDs. Repeating `reserveNext` after an Activity result is lost returns its prior decision rather than selecting a second client.
- Record pending launches, wakeups, and notifications in coordinator state in the same transition that creates their need. Process them outside synchronous handlers, with retry policies and visible failures. Do not block all pending work behind one slow notification.
- Bound delivery attempts and elapsed delivery time. Permanent invalid-recipient errors move on promptly. A messaging failure after booking must not unbook the client automatically.
- Before retrying an old delivery or accepting a late result, verify its offer ID and current status. External messages already sent cannot be recalled; stale links must be harmless. Real SMS exactly-once delivery depends on provider support and cannot be guaranteed by Temporal alone.
- If an offer is claimed but its opening Worker fails, normal replay/retries resume it. A bounded delivery phase and coordinator watchdog/reconciliation should recover genuinely abandoned claims; do not release an ambiguous claim merely because an RPC timed out.
- Keep acceptance and cancellation notifications ordered per booking and suppress unsent superseded messages where possible. A cancellation still needs a clear follow-up if confirmation was already sent.
- Worker downtime stops execution but does not erase persisted progress. Advancement resumes when Workers return; this is not a promise of delivery at an exact wall-clock instant during downtime.
- Use Continue-As-New for the coordinator, carrying active claims, deadlines, fulfilled-entry state, pending work, deduplication state, and a schema version. Finish handlers and account for pending messages before rollover. Address the coordinator by Workflow ID, not a pinned Run ID. See [the TypeScript lifecycle guide](https://docs.temporal.io/develop/typescript/workflows/continue-as-new).
- Bound snapshot size as well as history size. Define a retention/export policy before using the coordinator as a long-term customer or reporting database. A reporting projection may be added later without making it booking authority.
- Do not automatically recreate an empty coordinator after an unexpected terminal failure: recover its state first. Starting it initially and recovering it are different operations.

## Review of every catalog pattern

This table records our application decisions after reading the [catalog](https://docs.temporal.io/design-patterns) and the individual pages. “Later” means a useful extension, not a prototype requirement. Descriptions are brief; links lead to each full pattern.

| Pattern | Application to Juniper |
| --- | --- |
| [Child Workflows](https://docs.temporal.io/design-patterns/child-workflows) | Optional decomposition. Prefer independent opening executions to simplify coordinator rollover; children do not share variables or create cross-Workflow transactions. |
| [Parallel Execution](https://docs.temporal.io/design-patterns/parallel-execution) | Allow separate openings and independent notification work to progress concurrently. Never broadcast competing offers for one opening. |
| [Pick First](https://docs.temporal.io/design-patterns/pick-first) | Racing several delivery Activities is not needed. Response-versus-timeout uses a Workflow condition and deadline, not a race among customers. |
| [Signal with Start](https://docs.temporal.io/design-patterns/signal-with-start) | Useful for initial lazy entity creation. Avoid blindly recreating an empty coordinator after failure; ordinary commands target the established entity. |
| [Request Response via Updates](https://docs.temporal.io/design-patterns/request-response-via-updates) | Core: return confirmed, declined, canceled, or unavailable after applying a coordinator decision. |
| [Event Accumulator](https://docs.temporal.io/design-patterns/event-accumulator) | No batching delay for live acceptance. Potential later use for consolidating Sheet import events. |
| [Entity Workflow](https://docs.temporal.io/design-patterns/entity-workflow) | Core: one durable salon coordinator owns the shared decision state. |
| [Continue As New](https://docs.temporal.io/design-patterns/continue-as-new) | Needed for the long-lived coordinator; carry bounded state and deduplication across runs. |
| [Updatable Timer](https://docs.temporal.io/design-patterns/updatable-timer) | Use the durable condition-with-timeout foundation. Staff-adjustable deadlines are not currently required. |
| [Polling External Services](https://docs.temporal.io/design-patterns/polling) | No polling for client responses. Consider later only for an integration without callbacks. Browser status refresh is a separate presentation concern. |
| [Long Running Activity](https://docs.temporal.io/design-patterns/long-running-activity) | Do not hold an Activity open for the client's 15-minute response window. No current long computation needs heartbeat checkpoints. |
| [Delayed Start](https://docs.temporal.io/design-patterns/delayed-start) | Opening outreach begins immediately. Later option for scheduled outreach or quiet hours if requested. |
| [Delayed Callback](https://docs.temporal.io/design-patterns/delayed-callback) | Relevant for future SMS delivery webhooks; correlate callbacks to offer IDs. The prototype phone page calls the API directly. |
| [Approval](https://docs.temporal.io/design-patterns/approval) | Core human-response shape: wait, accept/decline, timeout. Use Updates for a returned acceptance result; no additional staff approval gate. |
| [Saga](https://docs.temporal.io/design-patterns/saga-pattern) | Release reservations on failed delivery as explicit cleanup. A multi-service Saga is unnecessary while one coordinator owns the decision. Compensation cannot prevent competing offers retroactively. |
| [Early Return](https://docs.temporal.io/design-patterns/early-return) | Acknowledge registration without waiting for outreach to finish; return booking confirmation before notification delivery finishes. Update-with-Start is optional and requires compatibility checks. |
| [Fixed Count of Retries](https://docs.temporal.io/design-patterns/fixed-count-retries) | Cap messaging attempts. Exhaustion becomes a visible outcome handled by the opening. |
| [Fixed Wall Time Retries](https://docs.temporal.io/design-patterns/fixed-wall-time-retries) | Core: bound total messaging time separately from the client response window. |
| [Non Retryable Errors](https://docs.temporal.io/design-patterns/non-retryable-errors) | Core: invalid recipients or permanent delivery rejection should move on rather than loop forever. |
| [Delayed Retry](https://docs.temporal.io/design-patterns/delayed-retry) | Later: honor provider Retry-After responses within the remaining deadline. |
| [Fast Slow Retries](https://docs.temporal.io/design-patterns/fast-slow-retries) | Indefinite slow retries conflict with a last-minute offer. Potential use for nonurgent reconciliation, with a defined policy. |
| [Retry Alerting via Metrics](https://docs.temporal.io/design-patterns/retry-metrics) | Production operational visibility. Prototype must at least show delivery failure and stalled work clearly to staff. |
| [Resumable Activity](https://docs.temporal.io/design-patterns/resumable-activity) | Optional staff correction flow later. Default delivery failure moves to the next client rather than waiting indefinitely for repair. |
| [Fan Out with Child Workflows](https://docs.temporal.io/design-patterns/fanout-child-workflows) | No large batch workload; unnecessary for 8–12 weekly cancellations. |
| [Batch Iterator](https://docs.temporal.io/design-patterns/batch-iterator) | Potential large import/export feature later; unnecessary for sample waitlist data. |
| [Sliding Window](https://docs.temporal.io/design-patterns/sliding-window) | Bounded batch concurrency does not enforce client exclusivity. Not needed for this volume. |
| [MapReduce Tree](https://docs.temporal.io/design-patterns/mapreduce-tree) | No large aggregation or recursive partitioning problem here. |
| [Downstream Rate Limiting](https://docs.temporal.io/design-patterns/downstream-rate-limiting) | Later for a real SMS provider or many salons. A throughput cap does not replace a client claim. |
| [Priority](https://docs.temporal.io/design-patterns/priority-task-queues) | Worker dispatch priority is separate from earliest-joined customer ordering. No need initially. |
| [Fairness](https://docs.temporal.io/design-patterns/fairness) | Multi-tenant Task dispatch fairness is separate from waitlist FIFO. No need initially. |
| [Local Activities](https://docs.temporal.io/design-patterns/local-activities) | Defer latency optimization; use ordinary Activities for messaging and coordinator calls with independent retry behavior. |
| [Early Return plus Local Activities](https://docs.temporal.io/design-patterns/early-return-local-activities) | No demonstrated subsecond latency requirement justifies this optimization. |
| [Eager Workflow Start](https://docs.temporal.io/design-patterns/eager-workflow-start) | No need to colocate the API and Worker for startup latency optimization. |
| [Worker Specific Task Queues](https://docs.temporal.io/design-patterns/worker-specific-taskqueue) | No host-local dependency; avoid making correctness depend on a particular Worker. |
| [Activity Dependency Injection](https://docs.temporal.io/design-patterns/activity-dependency-injection) | Use a shared Temporal Client and injected messaging adapter in Activities, so simulated messaging can later be replaced and tested independently. |

## Next design checkpoint

Agree on the authority boundary first: salon coordinator versus transactional database. If the coordinator is selected, define its command/result contracts and transitions next, then test two openings competing for one client, duplicate commands, stale expirations, acceptance/cancellation races, Worker restart, and Continue-As-New with an active offer. These checks should precede a polished interface.

The installed TypeScript SDK exposes the necessary Signal, Query, Update, and Continue-As-New APIs. This review did not execute a compatibility test against the running local server; that remains part of implementation verification.
