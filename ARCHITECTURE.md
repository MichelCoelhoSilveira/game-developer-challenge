# Architecture

## Runtime overview

The application is a client-side React 19 and TypeScript SPA built with Vite. `src/main.tsx` starts the MSW browser worker before rendering React, then mounts the app under React Strict Mode and a shared TanStack Query client. This lets the ranking and match-history screens use the same local mock API in development and in the production static build. If service-worker setup fails, the menu and game still render; API requests then fail and completed matches remain queued in local storage for retry.

`src/App.tsx` owns screen navigation, player preferences, the active match snapshot, match submission, and ranking/history panels. React state contains UI and durable match state, not per-frame ship positions. `src/game/ArenaGame.tsx` owns one PixiJS `Application` for the active battle. This boundary keeps frequent simulation updates out of React rendering.

## Game loop and input

The arena uses a 1600 × 1000 world coordinate space. Pixi renders water, tile-built islands, decorations, ships, health labels, projectiles, and short-lived effects. `ResizeObserver` resizes the renderer and updates the camera; mobile layouts follow the player while desktop shows the full arena. Renderer resolution is capped at 2× device pixel ratio.

The Pixi ticker advances the player, enemy AI, cooldowns, spawn schedule, projectiles, and effects using elapsed ticker time in seconds. Keyboard events and touch controls write to input state consumed by the simulation. Player movement is forward-only with independent steering; desktop input accepts WASD/arrow movement and weapon keys 1–3, K/L/Ç. Mobile uses a forward-and-steer virtual joystick plus the three fire buttons. The joystick clamps its vertical input so it cannot reverse.

Player options are validated and saved under `pirate-battle:player-options:v1`. Starting a match copies the selected duration and spawn interval into that match; later option changes apply only to a subsequent match. Session time is constrained to 60–180 seconds and enemy spawn interval to 1–30 seconds.

## Level, collisions, and combat

`src/game/level.ts` defines the tile layout and island decoration placement. Each island also has a rounded polygon collider. `src/game/arenaRules.ts` contains geometry and movement rules independent from Pixi: circle-vs-polygon intersection, world-bound clamping, and axis-by-axis collision resolution so ships can slide along shorelines.

The player and enemies are simulation entities with position, heading, health, cooldown, and lifecycle state. Chasers pursue and explode on contact; Shooters pursue, avoid land, and fire when in range. Their weapon direction is selected from the player's relative position. Projectiles move independently, and are removed on impact, collision with land, expiry, or leaving the world. Impact creates a short-lived explosion; damage also emits a crew sprite. Destroyed enemy wrecks remain briefly before despawn.

The result callback fires once when the timer expires or player health reaches zero. Abandoning the arena calls the exit path without recording a match. `app.destroy({ removeView: true }, { children: true })` tears down the Pixi view and display tree; the effect cleanup also removes keyboard, blur, visibility, resize, and ticker listeners. Shared texture URLs are loaded through Pixi's `Assets` cache and reused across entity sprites; display nodes are destroyed when their lifecycle ends. Textures are intentionally retained in the shared cache for subsequent matches rather than unloaded on every arena exit.

## Ranking, history, and persistence

`src/data/contracts.ts` defines `MatchRecord`, paginated results, ranking entries, and submission responses. `src/data/api.ts` is the Axios boundary (`/api`, five-second timeout) and owns local persistence for player identity, the last result, and pending submissions. A completed match is saved locally before it is submitted; a failed request leaves it pending. The menu retries pending records at startup and exposes a manual retry. Match IDs make the mock submission idempotent.

TanStack Query owns ranking and history reads, loading/error/empty states, cache freshness, retries, and invalidation. The query keys include the active options/player/page so results remain scoped. After a successful submission both ranking and history query families are invalidated. Paginated views keep the previous response while the new page loads, while query identity prevents a late page response from replacing the selected page.

MSW handlers in `src/mocks/handlers.ts` implement the REST endpoints entirely in the browser. Fixtures supply other captains; confirmed matches are stored under `pirate-battle:confirmed-matches:v1`, and pending submissions under `pirate-battle:pending-matches:v1`. Scenario selection is persisted under `pirate-battle:network-scenario:v1`. Available deterministic scenarios include empty and multi-page data, fixed/variable delay, out-of-order responses, client/server errors, connection loss, timeouts, partial endpoint failures, and registration timeout after server persistence. Reset mock data restores the success scenario and removes confirmed/pending mock records and the last result; player ID and preferences remain.

This is a static single-player demo, not a production leaderboard service. All mock data and player identity are local to the browser profile; another browser/device does not share scores.

## Test instrumentation and profiling

The `e2e` Vite mode adds `window.__PIRATE_GAME_TEST__` for Playwright only. It exposes deterministic seed/time controls and read-only state used by tests; game input and collision rules still run through the actual event handlers and Pixi simulation. Production builds use the normal `production` mode and do not expose those controls.

Playwright coverage is split between gameplay/network behavior and versioned visual snapshots in `tests/e2e/`. `tests/performance/profile.spec.ts` measures a deterministic three-minute optimized browser session and five arena mount/play/unmount cycles. See [`PERFORMANCE_REPORT.md`](PERFORMANCE_REPORT.md) for the measured hardware, Chromium version, frame statistics, heap samples, and limitations. The profiling session uses player invulnerability to finish consistently and does not represent a physical mobile-device or GPU-memory measurement.

## Known limitations

- MSW provides local, browser-scoped mock APIs; there is no server-side database or cross-device leaderboard.
- The profiled 60 FPS average has limited headroom: measured p95 frame interval was 16.80 ms, and the production bundle reports a chunk above 500 kB.
- Five post-GC cycles showed stable DOM node counts after the first cycle but a small upward JS heap trend. This is not enough evidence to prove a leak; longer runs and GPU resource instrumentation would be needed.
- Mobile behavior is covered by Chromium device emulation, not a physical handset.
- Combat values are centralized in `src/game/config.ts` where practical. Player-facing session/spawn settings are configurable; enemy health, movement/attack tuning, and projectile behavior remain balance decisions in the game implementation.
