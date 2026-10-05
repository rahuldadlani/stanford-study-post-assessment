# Representative Temporal Workflow evidence

The real end-to-end smoke passed at `2026-10-05T07:18:32.369Z`. Its saved JSON is in [the smoke evidence](../docs/evidence/first-slice-smoke.json).

- Workflow ID: `salon/juniper-v2/opening/a04ac601-34a5-4e50-81cb-9f7a14a72396`
- Expected status: `Completed`
- Business outcome: Maya Chen accepted an earlier haircut with Elena; one booking and one confirmation were recorded despite concurrent repeat acceptance.

## Screenshot still required before submitting

The starter requests a screenshot showing one representative Workflow in Temporal Web UI. This is not yet captured because the agent’s Computer Use session has no available browser or native app.

1. Open <http://localhost:8233>.
2. Find the Workflow ID above and open it.
3. Show its ID, Completed status, and meaningful event history (Activities, wait, Signal and completion).
4. Save a screenshot as `evidence/temporal-workflow.png`. Only fictional client data should be visible.

This file and the JSON evidence do not claim to replace the required UI screenshot.
