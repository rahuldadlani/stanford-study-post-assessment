# Juniper Salon · Temporal prototype

A local plain-HTML staff dashboard and private client invitation, backed by Express and durable Temporal Workflows. Openings move through the earliest eligible clients one at a time; clients accept or decline, and staff can cancel before or after booking.

Read [Lena’s requirements and prototype assumptions](docs/design-decisions.md) and [the criterion-by-criterion acceptance evidence](docs/evidence/acceptance.md). All 18 local tests and seven real Temporal/HTTP integration tests passed. The visible-app smoke also passed. Browser review, the starter-requested Temporal UI screenshot, and GitHub publication checks remain pending. See [the submission guide](docs/submission-guide.md).

## Run locally

Requires Node.js 20+ and Docker Desktop. Run `npm install` on a fresh clone, then:

```sh
npm run dev
```

Open <http://localhost:3000> and sign in with `juniper-demo`. Add a same-day haircut, open its **simulated text** link, and accept or decline. The staff view shows who has the offer, each outcome, and a reminder to update the real calendar. All clients are fictional and no real texts are sent.

The **Demo controls** section enables 10-second offers and a permanent first-delivery failure. Normal offers last 15 minutes, shortened when the appointment starts sooner. Staff can stop outreach or cancel an accepted booking; the client page then shows unavailable and a simulated cancellation is recorded.

Temporal UI: <http://localhost:8233>. Current coordinator: `salon/juniper-v2`; task queue: `juniper-salon-v2`. Each opening has its own Workflow. v2 starts with fresh fictional data; v1 histories and definitions remain preserved but are not migrated.

Ctrl+C stops the API and Worker. `npm run stop` stops Temporal and retains its Docker volume. To replenish sample clients without deleting old histories, stop the app and run:

```sh
SALON_WORKFLOW_ID=salon/juniper-v2-demo-2 npm run dev
```

## Verify

With the Temporal server running, use a second terminal:

```sh
npm run verify
npm run smoke
```

`verify` runs TypeScript, 18 local tests, Workflow bundling, and seven isolated real Temporal/HTTP scenarios, including Worker restart and Continue-As-New. It writes `docs/evidence/verification.json` with a source hash and all stage outcomes. It creates its own test Worker/API and does not consume the visible demo’s waitlist.

`smoke` requires `npm run dev` to remain running in another terminal; `verify` shuts down its temporary API on completion. It exercises the visible app through HTTP, including concurrent repeat acceptance, and checks the opening’s actual Temporal completion. It consumes one sample client and writes `docs/evidence/first-slice-smoke.json` only on success. Run it before the last five minutes of the salon day.

Other commands:

```sh
npm run typecheck
npm test
npm run check:workflows
TEST_TEMPORAL_ADDRESS=127.0.0.1:7233 npm run test:integration
npm run test:temporal
```

The last command uses ephemeral test servers and may download a binary. `verify` defaults to the existing local Temporal server, avoiding that download. Local decision/access tests need neither Docker nor network access.

## Prototype boundaries

The initial catalog is haircuts with Elena or Theo and four sample waitlist clients. Their precise availability and stable identity mapping are prototype fixtures; Sheets integration, real SMS, payments, and calendar replacement are outside this demo. Same-day creation uses America/Los_Angeles; the form and display use the device timezone.

The coordinator durably owns claims, fulfilled client identities, openings, notifications and pending launch/wakeup work. Synchronous Update handlers serialize competing decisions. Activity retries, persisted intents and durable timers handle process interruptions. Continue-As-New carries all state, including repeat-response outcomes; this bounded demo caps retained data at 100 openings.

The API binds to loopback. Staff password defaults to `juniper-demo`; set `STAFF_PASSWORD` to override. A random signing key is created in ignored `.juniper-secret` (file mode 0600), or supply `APP_SECRET` with at least 32 characters. Keep the key stable across restarts; never commit/package it. `.env` files are not automatically loaded.

## Code map

- `src/rules.ts` — atomic matching, reservation, progression, booking and cancellation
- `src/salon.ts` — coordinator state, Updates, durable intents and Continue-As-New
- `src/opening.ts` — each opening’s progression loop, Signals and durable deadline
- `src/activities.ts` — idempotent launch and Temporal Client communication
- `src/api.ts`, `src/access.ts` — HTTP, staff session and signed private links
- `src/seed.ts` — fictional waitlist
- `src/legacy/` — preserved first-slice Workflow definitions for old histories
- `public/` — HTML, CSS and browser JavaScript; no frontend build
- `tests/` — local rules/access and real Temporal/HTTP integration scenarios
- `scripts/verify.mjs`, `scripts/smoke.mjs` — reproducible evidence commands

## Important: create a new public repository—do not fork

Your submission must be in a brand-new **public** GitHub repository. **Do not use GitHub’s Fork button.** Forks connect submissions through GitHub’s fork network and can make other participants’ work easier to locate.

Do not add `john-b-yang` or `vishakhpk` as collaborators. Because the repository is public, the assessment team can review it without write access.

Before the timed assessment:

1. Create a new **public** repository in your assigned GitHub organization. Do not initialize it with a README.
2. Clone the starter:

   ```bash
   git clone <STARTER_REPOSITORY_URL> temporal-assessment
   cd temporal-assessment
   ```

3. Point the clone at your new repository:

   ```bash
   git remote remove origin
   git branch -M main
   git remote add origin git@github.com:<YOUR_ORGANIZATION>/<YOUR_REPOSITORY>.git
   git push -u origin main
   ```

4. Confirm that GitHub displays the **Public** label and does not say “forked from” another repository.

If you accidentally create a fork, do not push assessment work to it. Create a new public repository, change your local `origin`, and ask the course team to remove the fork. Do not search for or view other participants’ assessment repositories.

## Temporal documentation

- [TypeScript developer guide](https://docs.temporal.io/develop/typescript)
- [Continue-As-New](https://docs.temporal.io/develop/typescript/continue-as-new)
- [Message passing](https://docs.temporal.io/encyclopedia/workflow-message-passing)
