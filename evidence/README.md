# Representative Temporal Workflow evidence

## Temporal Web UI screenshot

[View the submitted screenshot](temporal-workflow.png), captured by Rahul from the local Temporal Web UI.

- Workflow ID: `salon/juniper-v2/opening/199eeaf7-f335-4b32-9c16-f15c40cdce4c`
- Workflow type: `openingWorkflowV2`
- Task queue: `juniper-salon-v2`
- Status: `Completed`
- Result: `"filled"`
- Visible history includes an Activity, a started timer, the `offerChanged` Signal, timer cancellation, and Workflow completion.

The screenshot demonstrates a completed opening and its Temporal event history. It is a separate run from the automated smoke below.

## Automated smoke evidence

The real end-to-end smoke passed at `2026-10-05T07:18:32.369Z`. Its saved JSON is in [the smoke evidence](../docs/evidence/first-slice-smoke.json).

- Workflow ID: `salon/juniper-v2/opening/a04ac601-34a5-4e50-81cb-9f7a14a72396`
- Status: `Completed`
- Business outcome: Maya Chen accepted an earlier haircut with Elena; one booking and one confirmation were recorded despite concurrent repeat acceptance.
