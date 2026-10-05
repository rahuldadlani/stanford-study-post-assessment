# Juniper Salon waitlist demo

A local prototype that helps Lena and Carla fill canceled appointments without manually following up with every client. Staff add an opening, the earliest suitable client receives a private offer, and the process moves to the next person after a decline, timeout, or simulated delivery failure.

The demo uses **fictional clients and simulated texts**. It does not send real SMS messages or change the salon’s calendar.

## Requirements

- **Node.js 20 or newer**, including npm.
- **Docker Desktop**, installed and running with Docker Compose available.
- Ports **3000**, **7233**, and **8233** available locally.

The first setup needs internet access to download npm dependencies and the Temporal Docker image. Run all commands below from the repository directory containing `package.json` and `compose.yml`.

## Start the demo

With Docker Desktop running, install the locked dependencies and start the entire demo with one command:

```sh
npm ci && npm run dev
```

On later runs, use `npm run dev` to start the demo without reinstalling dependencies.

`npm run dev` starts the local Temporal server in Docker, waits for its port, and launches the Worker and API. **Leave this terminal running.** Wait for these messages before trying the demo:

```text
Juniper Worker is ready.
Juniper Salon: http://localhost:3000
```

| Where to go | What it shows |
| --- | --- |
| [localhost:3000](http://localhost:3000) | Staff dashboard and private client pages |
| [localhost:8233](http://localhost:8233) | Temporal Web UI for inspecting Workflow status and history |

Sign in to the staff dashboard with password **`juniper-demo`**. No client account is required to open a private offer link.

There is no frontend build step. Express serves the HTML, CSS, and browser JavaScript directly.

## Try the demo

### Book an opening

1. Open the staff dashboard and sign in.
2. Add a **Haircut** with **Elena** or **Theo**, choose a future time today, and select the appointment length. For a full 15-minute response window, choose an appointment at least 15 minutes ahead.
3. Select **Find a client**. Under **Openings & outcomes**, watch the opening move to **Waiting for a reply** and show its recipient.
4. Under **Simulated texts**, select **Open private client link**. The link opens the client view in another tab.
5. Select **Yes, I’ll take it**. The client sees confirmation, and the staff dashboard shows the booking and a simulated confirmation text.
6. Staff update the real salon calendar separately.

Matching considers service, availability for the full appointment, and any required stylist preference. Among suitable clients, the earliest waitlist entry gets the first offer. A client cannot hold competing offers, and accepting fulfills their waitlist entry.

### See automatic progression

Create another opening and expand **Demo controls**:

- **Use 10-second offers** demonstrates a timeout quickly. Normal offers last up to 15 minutes, ending sooner if the appointment starts.
- **Simulate a delivery failure for the first client** records an undeliverable offer and moves to the next eligible client.

You can also select **No thanks** on a client offer to see a decline advance the waitlist. The dashboard records each attempt and ends the opening as unfilled when no eligible, available clients remain.

### Stop or cancel

Use **Stop outreach** before acceptance or **Cancel booking** afterward, then provide a brief reason. The current client link becomes unavailable, and the simulated inbox records the cancellation. Canceling a booking does not automatically put that client back on the waitlist.

The appointment form uses your device timezone. The prototype accepts only appointments on the current day in the salon’s **America/Los_Angeles** timezone.

## Run the checks

Keep `npm run dev` running in terminal 1. In terminal 2, open the same repository directory and run:

```sh
npm run verify
npm run smoke
```

These commands serve different purposes:

| Command | What it checks | Requirements |
| --- | --- | --- |
| `npm run verify` | TypeScript, 18 local tests, Workflow bundling, and seven real Temporal/HTTP integration scenarios | Temporal running on port 7233 |
| `npm run smoke` | The visible app: create an opening, follow its private link, accept twice, verify one booking and a completed Workflow | Demo API and Worker running, plus Temporal |
| `npm test` | Matching, reservations, responses, cancellation, deadlines, and access-token rules | Installed dependencies |
| `npm run typecheck` | TypeScript correctness | Installed dependencies |
| `npm run check:workflows` | Temporal Workflow bundle compilation | Installed dependencies |
| `TEST_TEMPORAL_ADDRESS=127.0.0.1:7233 npm run test:integration` | The seven integration scenarios, including Worker restart and coordinator rollover | Existing Temporal server |
| `npm run test:temporal` | Starter and salon tests using temporary Temporal test servers | May download a test-server binary |

`verify` starts its own isolated test Worker and API and shuts them down when it finishes. **It does not leave the demo app running on port 3000.** It does not consume the visible demo’s clients.

`smoke` uses the running demo and books one fictional client. Run it before the last five minutes of the salon day because it creates an appointment five minutes ahead.

Evidence is saved to:

- [`docs/evidence/verification.json`](docs/evidence/verification.json): verification output, timestamp, source hash, and stage results, including failures.
- [`docs/evidence/first-slice-smoke.json`](docs/evidence/first-slice-smoke.json): Workflow IDs and checked outcomes from a successful smoke run. A failed run does not overwrite a previous success, so check its timestamp.

The saved runs passed all 18 local tests, all seven integration tests, and the visible-app smoke. See the [acceptance matrix](docs/evidence/acceptance.md) for the evidence and remaining review items.

## Stop, resume, or start a fresh demo

Press **Ctrl+C** in the `npm run dev` terminal to stop the API and Worker. To stop the Temporal container as well:

```sh
npm run stop
```

Temporal keeps its state in the Docker volume. Running `npm run dev` again resumes the same salon and its existing history.

The demo starts with four sample clients. Booked clients stay fulfilled, and sample availability covers seven days from initialization. To get a fresh sample waitlist without deleting any old history, stop the application and choose a new salon ID:

```sh
SALON_WORKFLOW_ID=salon/juniper-v2-demo-2 npm run dev
```

Use that same ID when restarting this demo. Choose another unused ID for each fresh run.

## How the application fits together

The browser calls the Express API. The API sends commands to a salon coordinator Workflow, which owns shared waitlist and booking state. Each opening has a separate Workflow that requests a client reservation and waits durably for a response or deadline.

The coordinator makes reservation and booking decisions together, preventing competing openings from claiming the same client. Activities connect Workflow execution to Temporal Client operations, such as starting an opening or sending a wakeup Signal. A Worker executes this code; Temporal preserves progress so the process can resume after the Worker restarts.

There is no separate application database. Simulated messages and pending work are part of the coordinator’s durable state. Continue-As-New preserves that state while starting a fresh execution history.

Default Workflow configuration:

- Namespace: `default`
- Task queue: `juniper-salon-v2`
- Coordinator ID: `salon/juniper-v2`
- Opening IDs: `<coordinator ID>/opening/<request ID>`

The `src/legacy/` definitions preserve the earlier v1 prototype for old histories. The current demo starts a fresh v2 salon; it does not migrate v1 bookings or links.

## Repository structure

```text
.
├── src/
│   ├── api.ts              # Express routes and Temporal Client startup
│   ├── access.ts           # Staff sessions and signed private offer links
│   ├── worker.ts           # Worker startup and Activity registration
│   ├── workflows.ts        # Workflow exports, including the original starter
│   ├── salon.ts            # Shared state, command handlers, pending work, rollover
│   ├── opening.ts          # Offer progression, response Signals, durable deadlines
│   ├── rules.ts            # Matching, reservation, booking, and cancellation rules
│   ├── activities.ts       # Temporal Client bridge and idempotent Workflow launch
│   ├── messages.ts         # Signal, Query, and Update definitions
│   ├── types.ts            # Shared application data types
│   ├── seed.ts             # Fictional waitlist fixtures
│   └── legacy/             # Preserved v1 Workflow definitions
├── public/
│   ├── index.html          # Staff dashboard
│   ├── staff.js            # Dashboard actions and status polling
│   ├── offer.html          # Private client offer page
│   ├── offer.js            # Accept/decline actions and current offer status
│   ├── api.js              # Shared browser HTTP and display helpers
│   └── styles.css          # Shared responsive styling
├── tests/
│   ├── rules.test.ts       # Business rules and race-ordering checks
│   ├── access.test.ts      # Token and staff-session checks
│   ├── salon.test.ts       # Real Temporal/HTTP, restart, and rollover tests
│   └── workflow.test.ts    # Original starter Workflow test
├── scripts/
│   ├── dev.mjs             # Start Docker Temporal, Worker, and API
│   ├── verify.mjs          # Run verification and write evidence
│   ├── smoke.mjs           # Exercise the visible demo end to end
│   └── check-workflows.mjs # Compile the Temporal Workflow bundle
├── docs/                   # Requirements, architecture, demo guide, test evidence
├── evidence/               # Temporal Web UI screenshot and run details
├── compose.yml             # Temporal development server and persistent volume
├── package.json            # Scripts and dependencies
├── package-lock.json       # Locked dependency versions
├── tsconfig.json           # TypeScript configuration
└── AGENTS.md               # Repository guidance for coding agents
```

## Optional configuration

Set environment variables in your shell or before a command. `.env` files are **not loaded automatically**.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | API and browser interface port |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal connection for API, Worker, and smoke test |
| `TASK_QUEUE` | `juniper-salon-v2` | Queue shared by the API’s Workflows and Worker |
| `SALON_WORKFLOW_ID` | `salon/juniper-v2` | Coordinator identity and sample dataset |
| `STAFF_PASSWORD` | `juniper-demo` | Staff login password |
| `APP_SECRET` | Generated locally | Signing key; supply at least 32 characters to override |
| `BASE_URL` | `http://127.0.0.1:3000` | Demo API address used by the smoke test |
| `TEST_TEMPORAL_ADDRESS` | `127.0.0.1:7233` in `verify` | Existing Temporal server used by integration tests |

For example, to use a different app port:

```sh
# Terminal 1
PORT=3001 npm run dev

# Terminal 2
BASE_URL=http://127.0.0.1:3001 npm run smoke
```

Open port 3001 in this example. If you change the staff password, pass the same `STAFF_PASSWORD` to the smoke command. Keep the Worker and API on the same task queue. The development launcher always starts the supplied local Docker service; custom remote Temporal hosting is outside this setup.

On first use, the app creates `.juniper-secret` with a random signing key and file mode `0600`. Keep it stable across restarts so existing links remain valid. It is ignored by Git. Do not include it or `.env` in a submission. The API binds to loopback for local use.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Smoke fails with `ECONNREFUSED 127.0.0.1:3000` | Start `npm run dev` in another terminal and leave it running. Wait for the API URL. Running `verify` alone does not start a persistent demo app. |
| Docker cannot start Temporal | Open Docker Desktop, wait until it is ready, and retry `npm run dev`. |
| A port is already in use | Stop the previous demo process. For the API, you can also use `PORT` and matching `BASE_URL` as shown above. |
| An opening stays pending | Check the `npm run dev` terminal for Worker errors and confirm the API and Worker use the same task queue. Inspect the Workflow in Temporal Web UI. |
| No eligible clients remain | Earlier runs may have booked all four clients, other offers may hold them, or their sample availability may have elapsed. Start a fresh salon ID. |
| The appointment date is rejected | Choose a future appointment on the current day in America/Los_Angeles. The form uses your device’s timezone. |
| An old client link is unavailable | The offer may have expired, progressed, or been canceled. Use the latest simulated offer. Changing the signing key also invalidates old links. |
| Temporary test-server download fails | Start the local Temporal server and use `npm run verify` or the existing-server integration command above. |

## Scope and further reading

This prototype supports same-day haircuts with Elena or Theo, fictional availability, and simulated delivery. Live SMS, Google Sheets synchronization, payments, and calendar replacement are excluded. Staff update the real calendar manually. The coordinator retains at most 100 openings per demo salon.

- [Customer requirements and explicit assumptions](docs/design-decisions.md)
- [Temporal architecture decisions](docs/temporal-architecture-review.md)
- [Acceptance criteria and saved evidence](docs/evidence/acceptance.md)
- [Four-slide client presentation (PDF)](docs/juniper-salon-presentation.pdf)
- [Presentation walkthrough and submission guide](docs/submission-guide.md)
- [Temporal UI screenshot evidence](evidence/README.md)

Assessment destination: **`rahuldadlani/stanford-study-post-assessment`**. Push only to that repository, never to the starter. The assessment requires a public repository outside GitHub’s fork network and does not require adding the starter owners as collaborators.
