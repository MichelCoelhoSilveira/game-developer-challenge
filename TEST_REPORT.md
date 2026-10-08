# Playwright test report

## Latest run

- Result: **32 passed, 0 failed**.
- Runtime: 36.1 seconds, four workers.
- Projects: Chromium desktop at 1365 × 900 and Chromium emulating Pixel 7.
- Browser automation: Playwright 1.64.0.
- Command: `npm run test:e2e`.

The run covers options validation and persistence; asset-load failure and retry; movement, arena bounds and island collisions; all player weapons and cooldowns; Chaser/Shooter behavior and spawn cadence; timeout/sinking, pause/resume, blur handling and clean restart; result persistence; abandonment and mobile touch controls; ranking/history states, pagination, pending submission recovery, registration timeout idempotency, and out-of-order queries. Visual snapshots cover the menu, stable arena, and result screen in both projects.

The run emitted a Vite warning that Playwright blocks service-worker registration in its test context. The app intentionally catches that initialization failure so the test worker can continue intercepting requests. No test failed. Traces and screenshots are retained on test failure; none were produced by this passing run.

The self-contained Playwright HTML report is in [`playwright-report/index.html`](playwright-report/index.html). To regenerate it, run `npm run test:e2e`; see the README for setup and browser installation.
