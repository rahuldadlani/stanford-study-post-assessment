# First slice: implementation and evidence

Historical first-slice report. Rahul subsequently authorized continuing. The live first-slice result was not available when work resumed. See [the current v2 acceptance evidence](acceptance.md) for current implementation and test status.

## Implemented path

Staff signs in → adds a same-day opening → the salon coordinator durably queues an opening Workflow → the opening requests a client reservation → the coordinator selects the earliest eligible, unclaimed client and stores a simulated text → the client follows a signed private link → an Update atomically books the opening and fulfills the client’s entries → one simulated confirmation appears and a durable wakeup lets the opening Workflow complete.

Staff snapshot polling and the client page display this result. Both appointment fields and response projection deliberately omit other clients’ data. The coordinator owns the authoritative state; no application database or API-memory booking state is used. Messaging is explicitly simulated by durable records, with no external SMS delivery claim.

The offer deadline is enforced inside the booking transition and by a Temporal durable wait. In this first slice, an expired offer ends unfilled; advancing to another candidate is deliberately deferred until review.

## Executed checks

- `npm run typecheck`: PASS.
- `npm test`: PASS, 10 tests across `tests/rules.test.ts` and `tests/access.test.ts`.
- Temporal `bundleWorkflowCode` against `src/workflows.ts`: PASS (1.60 MiB). The agent used a writable temporary SWC cache because its sandbox cannot write the default Library cache.
- `git diff --check`: PASS at the initial verification; rechecked after documentation edits.
- `npm run smoke`: BLOCKED at the first HTTP request, `connect EPERM 127.0.0.1:3000`.
- `TEST_TEMPORAL_ADDRESS=127.0.0.1:7233 node --import tsx --test tests/salon.test.ts`: BLOCKED connecting to Temporal, `PermissionDenied / Operation not permitted`.

The latter two are environment blocks, not successful application tests. No fabricated or simulated end-to-end evidence is substituted for a Temporal run.

## Live smoke run

Start Docker Desktop, then run from this repository:

```sh
npm run dev
```

In a second terminal in the same directory:

```sh
npm run smoke
```

The smoke test creates a real opening five minutes from now, follows its private link through HTTP, sends two concurrent acceptance requests, verifies one confirmation and a fulfilled waitlist entry, checks that the client response contains only appointment fields, rejects a tampered token, and checks the opening Workflow’s actual `COMPLETED` status in Temporal. It writes `docs/evidence/first-slice-smoke.json` only after every check passes. Run before the last five minutes of the salon day (America/Los_Angeles), since only same-day openings are accepted.

The smoke test consumes one fictional waitlist client. Four are seeded; subsequent runs can use a fresh `SALON_WORKFLOW_ID=salon/juniper-demo-2 npm run dev` after stopping the previous API/Worker. Existing histories are preserved. A JSON file from an older run is historical evidence; check its timestamp before treating it as verification of current code.

For an isolated real-Temporal integration check, with the server running:

```sh
TEST_TEMPORAL_ADDRESS=127.0.0.1:7233 node --import tsx --test tests/salon.test.ts
```

## All acceptance criteria

Local rule tests exercise transitions in memory. They are evidence for the decision logic, not proof of distributed execution, UI behavior, or restart recovery.

| Acceptance criterion | Current evidence | Remaining before packaging |
| --- | --- | --- |
| Earliest eligible entry gets sole active offer | PASS local rule test: earliest client and one simulated offer on retry | Live smoke result and UI review |
| Service, availability, required stylist matching | PASS local test with four mismatch fixtures, including full appointment duration | Integration coverage for these fixtures |
| Accept confirms once, fulfills entry, notifies both sides | PASS local transition test; staff display and simulated confirmation implemented | Live HTTP/Temporal smoke |
| Decline, timeout, delivery failure advances automatically | Deadline rejection tested; expiry currently ends unfilled | Implement progression, decline, simulated delivery failure; test each |
| Repeated acceptance / lost-response retry | PASS local idempotence test; request identity retained after API error | Concurrent HTTP smoke and interrupted-response test |
| Old link after progression/cancel is unavailable | Expired link rejected in local rule test; client page has contact direction | Implement progression/cancel and verify old links |
| Concurrent openings cannot acquire same client | PASS local serialized transitions with duplicate client rows | Real concurrent Workflow integration test |
| Accept races cancel/timeout consistently | PASS local accept-at-deadline and expiry-after-accept checks | Cancellation implementation and real race tests |
| Worker restarts during wait | Durable wait and state implemented | Actual stop/restart demonstration with unchanged deadline/history |
| Staff cancel before acceptance | Not implemented in first slice | Implement and verify |
| Staff cancel after acceptance and notify client | Not implemented in first slice | Implement and verify, including stale confirmation ordering |
| Exhausted candidates show unfilled/history | PASS local empty-list test; staff display implemented | Integration after multiple offer attempts |
| Private link exposes only own offer | PASS token tamper/purpose/expiry tests; public API projects appointment-only fields | HTTP smoke and client-page inspection |

Additional pre-packaging checks: bound coordinator history with Continue-As-New; preserve outstanding work/claims/fulfilled entries across rollover; demonstrate all views on a phone-sized screen; confirm destination repository is public and not a fork; verify no write to the starter repository.

## Explicit first-slice assumptions

- Local-only demo: loopback API, known staff password `juniper-demo`, development signing secret. Optional `STAFF_PASSWORD` and `APP_SECRET` environment variables override defaults; `.env` is not loaded automatically. Keep the signing secret stable across API restarts so existing links remain valid. This is not production authentication.
- Salon timezone America/Los_Angeles. Appointment inputs use the device timezone and are displayed in the viewer’s timezone. The API limits creation to the current salon day.
- Four fictional haircut clients, exact availability windows, stable fictional client IDs, deterministic earliest-joined ordering. Phone identity normalization and Sheets import remain outside the current slice.
- Offer expiry starts when recorded and is the earlier of 15 minutes or appointment start.
- Other currently offered clients are skipped. If none are available, the opening ends unfilled; this unresolved product rule is visible in the requirements.
- No Continue-As-New or data retention yet. The coordinator is intentionally bounded to this small demonstration until the remaining implementation.
