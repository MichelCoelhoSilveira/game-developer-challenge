# Pirate Battle

A single-player top-down naval shooter built with React, TypeScript, and PixiJS. Sail around islands, fight enemy ships, and score points before time runs out. Ranking and match history are provided by browser-local MSW fixtures.

The original take-home assignment is preserved in [`CHALLENGE.md`](CHALLENGE.md). Architecture, profiling, and test evidence are documented separately below.

## Requirements

- Node.js 20.19+ (or 22.12+) and npm.
- No environment variables, API keys, backend, or private services are required. See [`.env.example`](.env.example).

## Run locally

```bash
npm ci
npm run dev
```

Vite prints the local URL. To build and serve the production bundle locally:

```bash
npm run build
npm run preview
```

## Controls

| Action | Keyboard | Mobile |
| --- | --- | --- |
| Move forward | W or ↑ | Push joystick up |
| Turn | A / ← and D / → | Push joystick left or right |
| Fire left broadside | 1 or K | Left cannon button |
| Fire forward | 2 or L | Center cannon button |
| Fire right broadside | 3 or Ç | Right cannon button |
| Pause / resume | Escape or in-game button | In-game button |

Numpad 1–3 also fire left, front, and right. Movement and firing can be used at the same time. The mobile joystick does not move the ship backwards. The game pauses when its window loses focus.

## Options and persistence

The Options screen saves settings in the current browser profile:

- Match duration: 60–180 seconds.
- Enemy spawn interval: 1–30 seconds.

Each match uses a snapshot of the settings taken when it starts. The player identity, last result, confirmed mock matches, and pending submissions are also stored locally in the browser. They are not shared between browsers or devices.

## Ranking, history, and network scenarios

MSW intercepts `/api/ranking`, `/api/history`, and `/api/matches` in development and in the published static build. Axios makes the requests; TanStack Query manages reads, caching, pagination, retries, and invalidation. There is no remote leaderboard service.

Open **Options → Network simulation** to select a scenario:

- **Success**, **Empty lists**, **Multiple pages**.
- **Slow network**, **Variable latency**, **Out-of-order responses**.
- **Request timeout**, **Connection failure**, **HTTP 429**, **HTTP 503**.
- **Ranking unavailable**, **History unavailable**.
- **Registration timeout after save**, **API unavailable**.

To verify pending-match recovery, select **API unavailable**, finish a match, switch back to **Success**, then choose **Retry** on the result or pending notice. To verify idempotent submission, select **Registration timeout after save**, finish a match, and retry; the same match ID prevents duplicate records. **Reset mock data** restores **Success** and removes mock matches, pending submissions, and the saved last result; player options and identity are preserved.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:e2e:report
npm run test:profile
```

The Playwright suite exercises gameplay, options, network recovery, and visual snapshots in desktop Chromium and Pixel 7 device emulation. Its self-contained HTML report is [`playwright-report/index.html`](playwright-report/index.html); the last run summary is [`TEST_REPORT.md`](TEST_REPORT.md). The profiling command builds an optimized bundle, records one deterministic three-minute match, and samples memory after five arena lifecycle cycles. See [`PERFORMANCE_REPORT.md`](PERFORMANCE_REPORT.md), [`performance-report/results.json`](performance-report/results.json), and [`performance-report/html/index.html`](performance-report/html/index.html).

## Architecture

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the React/PixiJS boundary, simulation and collision loop, asset lifecycle, local persistence, ranking/history flows, MSW behavior, tradeoffs, and known limitations.

## Production deployment

[`vercel.json`](vercel.json) configures the Vite build and `dist` output directory. Once authenticated with the Vercel CLI, deploy from the project root:

```bash
npx vercel --prod
```

Choose the existing Vercel project or create one, use `./` as the project directory, and retain the build settings from `vercel.json`. The CLI prints the public deployment URL when the upload completes. The deployed app serves the MSW worker and fixtures as static assets.

**Public URL:** [https://game-developer-challenge-tawny-alpha.vercel.app](https://game-developer-challenge-tawny-alpha.vercel.app)

## Project layout

```text
src/
  App.tsx             Screens, options, result, ranking/history UI
  data/               Shared API contracts and Axios client
  game/               PixiJS arena, level, config, and collision rules
  mocks/              MSW handlers and deterministic network scenarios
tests/
  e2e/                Gameplay, network, and visual Playwright coverage
  performance/        Optimized build profiling scenarios
assets/               Supplied ship, island, effects, and audio assets
```
