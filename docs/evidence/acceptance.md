# Acceptance evidence — Juniper Salon v2

The expanded prototype is implemented. A local review package can be prepared from the verified source. Final submission still needs visual review, the starter-requested Temporal UI screenshot, and GitHub publication checks. This report records evidence before packaging; implementation alone is not a passing acceptance result.

Rahul authorized continuing after the first-slice handoff. The visible-app smoke subsequently passed; its saved result is linked below.

## Executed evidence

- TypeScript: **PASS** (`npm run typecheck`).
- Local decision/access tests: **18 PASS** (`npm test`).
- Workflow bundle: **PASS** (`npm run check:workflows`).
- Browser JavaScript syntax: **PASS**, checked as ES modules.
- Real Temporal/HTTP integration: **7 PASS**, from the user-run verification at `2026-10-05T07:15:57.229Z`. The saved SHA-256 matches the current source. This supersedes the earlier sandbox-blocked attempt. Restart, rollover, concurrency, progression, cancellation and HTTP privacy scenarios all ran successfully.
- Visible-app smoke: **PASS** at `2026-10-05T07:18:32.369Z`. [Saved result](first-slice-smoke.json): Maya Chen received the offer; concurrent repeat acceptance produced one confirmation; the opening is filled and its Temporal Workflow is `COMPLETED`. This supersedes the earlier API-not-running error.
- Visual review on desktop/mobile: **NOT YET VERIFIED**. The user reports the app works. Automated visual inspection was unavailable: Computer Use returned no browsers/apps and a native-pipe startup failure. No screenshot was fabricated.
- Starter-requested Temporal UI screenshot: **PENDING**; see [capture instructions](../../evidence/README.md).

[`verification.json`](verification.json) contains command output, execution timestamp, source SHA-256, and each stage’s exit status. The source hash covers application code, scripts, tests, and package files, but excludes documentation, credentials and generated evidence. A live rerun replaces the report, including failed results; it never silently claims success.

## Criterion-by-criterion assessment

Each local rule test is named in `tests/rules.test.ts`; access tests are in `tests/access.test.ts`. They call the same synchronous transition logic used by the coordinator. All seven tests in `tests/salon.test.ts` now pass against actual Temporal and HTTP. The separate visible-app smoke also passed. Manual desktop/mobile UI inspection remains pending.

| # | Acceptance criterion | Evidence already obtained | Live verification status |
| --- | --- | --- | --- |
| 1 | Earliest eligible client receives the sole active offer | PASS: “earliest eligible client gets the only offer”; retried claim creates one simulated text | PASS: Temporal matching/acceptance test. Browser review pending |
| 2 | Exclude service, time and required-stylist mismatches | PASS: four mismatch fixtures, including availability for the full appointment | PASS: integration matching excludes the earliest client with a different stylist |
| 3 | Accept immediately confirms once, fulfills entry and informs both sides | PASS: atomic acceptance, all duplicate client rows fulfilled, one confirmation; staff/client views implemented | PASS: Temporal acceptance, HTTP tests and the visible-app smoke |
| 4 | Decline, timeout and permanent delivery failure advance automatically | PASS: separate decline, timeout and simulated failure transitions; next candidate; reasons recorded | PASS: progression integration waited for an actual durable 10-second demo timer and checked all three paths |
| 5 | Repeat acceptance/lost-response retries never duplicate booking | PASS: same result and one confirmation on retry; fulfillment excludes future offers | PASS: concurrent accepts through Temporal/HTTP and old acceptance retried after rollover |
| 6 | Old links after progression or cancellation cannot book | PASS: decline/timeout/cancel stale-offer rejection; public view displays contact-salon direction | PASS: HTTP stale-link and cancellation checks |
| 7 | Concurrent openings cannot offer the same client | PASS: serialized claims, including duplicate waitlist rows for one identity | PASS: concurrent opening Workflows selected different client IDs |
| 8 | Acceptance racing cancellation/timeout has a consistent result | PASS: cancellation before/after acceptance; accept exactly at deadline; late expiry cannot undo acceptance or release a newer offer | PASS: Temporal accept/cancel race and actual timer progression |
| 9 | Worker restart retains original deadline and history | State and durable wait implemented; no API/browser-owned timeout | PASS: Worker stopped and replaced; exact offer/deadline/history preserved; subsequent decline progressed |
| 10 | Staff can stop before acceptance | PASS: cancellation invalidates current offer, prevents next claim, leaves entry eligible; UI control implemented | PASS: live cancellation/HTTP test. Manual front-desk review pending |
| 11 | Staff can cancel after acceptance and notify client | PASS: accepted offer becomes canceled, one cancellation message, old confirmation marked superseded, entry does not automatically rejoin | PASS: canceled after opening Workflow completed `filled`; HTTP client status became canceled |
| 12 | Exhaustion stops unfilled with attempt history | PASS: empty list and all-four-decline cases; four outcomes retained | PASS: progression ended unfilled after failure/decline/timeout/decline |
| 13 | Client sees only own offer; waitlist remains private | PASS: token tampering/purpose/expiry checks. API explicitly projects six appointment fields and a minimal response; staff routes require session | PASS: HTTP field/response allowlists, unauthenticated staff rejection and tampered link. Mobile review pending |

## Additional durability and scope checks

- Continue-As-New carries the full schema-versioned state: offers/deadlines, fulfilled client identities, old response outcomes, simulated messages, pending launch and wakeup intents. It runs from the main Workflow after handlers finish and no Activity is in flight. The actual rollover integration test **passed**.
- The coordinator responds to Temporal’s `continueAsNewSuggested` and also rolls at 100 commands. Its state is capped at 100 openings with four sample clients, keeping the bounded demo snapshot small. See [Temporal’s Continue-As-New guidance](https://docs.temporal.io/develop/typescript/continue-as-new).
- Wakeup intents are intentionally not merged while being delivered: a later client response needs its own Signal. The opening captures its signal revision before requesting state, avoiding a response lost during an Activity.
- Normal offer deadline is 15 minutes, clipped to appointment start. Staff can explicitly enable a 10-second demo; the UI labels it.
- Delivery is simulated, stored durably with the reservation. The demo failure control marks the first offer undeliverable and advances. This does not claim real provider delivery/retry integration.
- Client signing key is generated randomly on first use, stored in ignored `.juniper-secret` with mode `0600`, and retained across API restarts. `APP_SECRET` (32+ characters) overrides it. Do not package either secret. Staff password defaults to `juniper-demo` for the local loopback prototype.
- Current Git origin points only to `rahuldadlani/stanford-study-post-assessment`. GitHub publication is pending: the shell could not resolve `github.com`, and the web fetch also failed. Public visibility and non-fork status remain unverified. Local Git history and a review archive can be prepared without publishing.

## Run the visible-app smoke and reproduce verification

From the repository, with Docker Desktop running:

```sh
npm run dev
```

In another terminal:

```sh
npm run verify
npm run smoke
```

`verify` connects to the existing Temporal server, creates isolated test salons and its own Worker/API, tests recovery/rollover, and cleans up its test Workflows. It does not consume clients from the visible demo. `smoke` tests the visible app on port 3000, consumes one fictional client, and saves actual Workflow IDs in `first-slice-smoke.json` only if its checks pass. Run that smoke before the final five minutes of the salon day because its new opening is five minutes ahead.

## Short browser walkthrough

1. Sign in at localhost:3000 with `juniper-demo`. Create a future same-day haircut. Open its simulated text link and accept; check that the front desk says booked and asks you to update the real calendar.
2. Cancel that booking from the front desk; the client page must change to unavailable and a simulated cancellation must appear.
3. Create another opening using “10-second offers” and “Simulate a delivery failure.” Watch the recorded failure, then a timeout, then the next offer. Open its link and decline or accept. Check every reason in the opening history.
4. At phone width, check that both response buttons, appointment details, status and salon-contact direction fit without horizontal scrolling.

Default v2 is a fresh fictional salon (`salon/juniper-v2`, queue `juniper-salon-v2`); v1 histories and definitions are preserved in `src/legacy`. Existing v1 client links are not migrated to v2. To replenish consumed sample entries without deleting history, stop the demo and run `SALON_WORKFLOW_ID=salon/juniper-v2-demo-2 npm run dev`.

## Representative end-to-end result

- Workflow: `salon/juniper-v2/opening/a04ac601-34a5-4e50-81cb-9f7a14a72396`
- Recipient: **Maya Chen** (fictional sample client)
- Appointment: haircut with Elena
- Outcome: **filled / Temporal COMPLETED**
- Evidence: staff access enforced; private offer fields checked; two simultaneous acceptance requests succeeded; one confirmation stored; entry fulfilled; tampered link rejected.

The verification file’s source SHA-256 was checked against the current application, scripts, tests and lockfile. Only submission documentation changed afterward; no new untested application changes were introduced while packaging.
