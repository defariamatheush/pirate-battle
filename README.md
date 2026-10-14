# Pirate Battle

A top-down 2D naval shooter built with React 19, TypeScript (strict), PixiJS 8, TanStack Query, Axios, MSW and Playwright. You sail between islands, sink Chasers and Shooters, and climb a mocked ranking.

Related documents:

* [CHALLENGE.md](CHALLENGE.md): the original challenge statement
* [ARCHITECTURE.md](ARCHITECTURE.md): architecture and design decisions
* [docs/PERFORMANCE.md](docs/PERFORMANCE.md): performance and memory evidence
* [docs/TESTING.md](docs/TESTING.md): test report, with the HTML report committed in `playwright-report/`
* [CREDITS.md](CREDITS.md): credits and licences

Live demo: add the deployed URL here after `vercel --prod` (see [Deploy](#deploy)).

## Setup

You need Node 20 or newer (developed on Node 24) and npm.

```bash
npm ci
npx playwright install chromium   # only needed for the E2E tests and profiling
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with HMR at http://localhost:5173. Mocks are active. |
| `npm run build` | Type-checks (`tsc -b`) and builds into `dist/`. |
| `npm run preview` | Serves the production build at http://localhost:4173. |
| `npm run lint` | ESLint (typescript-eslint, react-hooks). |
| `npm run typecheck` | `tsc -b --noEmit` in strict mode. |
| `npm run test:unit` | Vitest: simulation rules, ranking order, fixtures. |
| `npm run test:e2e` | Playwright on desktop, mobile Chromium and StrictMode/dev. It builds and serves the app itself. |
| `npm run test:e2e:update` | Regenerates the visual baselines in `e2e/__screenshots__/`. |
| `npm run test:report` | Opens the Playwright HTML report. |
| `npm run profile` | Profiles the production build and writes `docs/profiling/*.json`. |

To run one spec on one project: `npx playwright test combat --project=desktop`.

### Environment variables

All variables are optional (see [.env.example](.env.example)), and each one can be overridden with a URL parameter.

| Variable | URL param | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_API_TIMEOUT_MS` | `?apiTimeout=` | `8000` | Axios timeout for ranking, history and record calls |
| `VITE_RETRY_BASE_DELAY_MS` | `?retryDelay=` | `800` | Base of the exponential retry back-off (0 means immediate) |
| `VITE_MAX_RETRIES` | `?retries=` | `2` | Retries for queries and for the record-match mutation |

Other URL parameters: `?scenario=<id>`, `?mockSeed=<n>` and `?mockLatency=<scale>` for the mock API; `?touch=1` to force the on-screen controls on desktop; `?perf=1` for an FPS overlay; and `?e2e=1&clock=manual&seed=<n>&playerHp=<n>` for the test hooks described below.

## How to play

| Action | Keyboard | Touch |
| --- | --- | --- |
| Sail forward | `W` or `↑` | Up button (hold) |
| Turn left or right | `A` `D` or `←` `→` | Turn buttons |
| Fire forward (1 cannonball) | `Space` | Centre cannon |
| Broadside left or right (3 parallel cannonballs) | `Q` / `E` | Left and right cannons |
| Pause or resume | `Esc` or `P` | Pause button |

You can hold any combination at once, for example sail, turn and fire. On phones a match is played in landscape; in portrait the game shows a "rotate your device" notice and pauses. It also pauses when the window loses focus or the tab is hidden. Resuming always takes a click or a keypress, and anything pressed during the pause is discarded.

You score 1 point per enemy you sink. A Chaser that rams you explodes but gives no point. The match ends when time runs out or your hull reaches 0.

## Gameplay configuration

The Options screen saves to `localStorage` and applies to the next match. It has two fields: game session time (60 to 180 whole seconds) and enemy spawn time (1 to 15 seconds, in steps of 0.5). Invalid values are rejected with accessible messages. Each match takes a snapshot of the options when it starts.

All balancing lives in one typed object, `DEFAULT_GAMEPLAY` in [`src/config/gameplay.ts`](src/config/gameplay.ts). It covers durations, spawn interval, weights and limits, health, speeds, turn rates, damage, projectile speed, lifetime and radius, cooldowns and the Shooter's ranges. The systems read only from the `GameplayConfig` they are constructed with, so rebalancing is a data change.

## Mock API, scenarios and failures

MSW serves the ranking and history API from a service worker, in the deployed build too. Finished matches are stored in `localStorage`, so both tabs agree and survive refreshes.

You can pick a scenario in three ways:

1. Main menu, then Network scenarios: a dialog with a radio list and a Reset button.
2. The URL `/?scenario=<id>`, which persists until you change or reset it.
3. The console: `__MOCK__.set({ scenario: 'http-5xx' })`, `__MOCK__.reset()` and `__MOCK__.settings()`.

Reset (the dialog button or `__MOCK__.reset()`) clears the confirmed mock records, the queued matches and the last result, and restores the Success scenario.

| `scenario` id | What happens |
| --- | --- |
| `success` | Normal behaviour with about 120 ms latency |
| `empty` | Ranking and history are empty |
| `many-pages` | Ranking with 200 entries (25 pages) and history with 40 matches (5 pages) |
| `slow` | Every response takes about 2.5 s |
| `variable-latency` | Seeded random latency between 100 ms and 2 s (`?mockSeed=`) |
| `out-of-order` | Every other GET is slow (about 2.5 s), so newer replies overtake older ones |
| `timeout` | GET ranking and history never answer, so Axios times out and the error state appears |
| `network-error` | Requests fail at the network level |
| `http-4xx`, `http-5xx` | Every call answers 429/422, or 500 |
| `ranking-fail`, `history-fail` | Only one of the two lists fails (500) |
| `post-timeout-after-commit` | The first `POST /matches` is stored but never answers, and the retry must not duplicate it |
| `post-unavailable` | `POST /matches` answers 503 until you switch scenario, so the match stays queued and is saved after recovery |
| `assets-flaky` | The first request for every ship image fails, which shows the asset error screen with Try again |

To reproduce the more interesting failures:

* Saving after recovery: open `/?scenario=post-unavailable` and finish a match. The result screen says the save failed, the menu shows a pending banner, and a refresh keeps it. Then open the dialog, choose Success and press Retry now.
* Timeout after commit: open `/?scenario=post-timeout-after-commit&apiTimeout=1500` and finish a match. It ends up saved, with one history row and one ranking entry.
* Stale responses: open `/?scenario=out-of-order` and switch quickly between the Ranking and Match History tabs.
* Asset failure: open `/?scenario=assets-flaky`, press Play, then press Try again.

For tests, `?mockSeed=<n>` fixes the random latency and `?mockLatency=0` removes delays.

## Testing

```bash
npm run test:unit      # fast rules tests
npm run test:e2e       # 127 Playwright tests: desktop, mobile (Pixel 7 landscape) and StrictMode
```

The tests run against the production build (`vite build` plus `vite preview`). Each one gets its own browser context, so `localStorage`, the service worker and the MSW database start empty. The suite covers the twelve areas of the brief: options, assets and retry, movement, arena and islands, weapons, cooldowns and scoring, Chaser, Shooter and spawns, endings by time and by death with a clean restart, pause, focus and resume, result persistence, abandoning and repeated navigation, touch controls, ranking and history (loading, empty, error, pagination), recording, recovery, idempotency and stale responses. It also has visual regression for the menu, a stable arena and the result screen, with baselines in `e2e/__screenshots__/<project>/`.

Opening the app with `?e2e=1&clock=manual&seed=1` installs `window.__PIRATE_TEST__` and replaces the real-time ticker with explicit stepping:

```ts
__PIRATE_TEST__.getState()           // read-only snapshot (player, enemies, projectiles, islands, timers)
__PIRATE_TEST__.advance(ms)          // advance the simulated clock (real fixed-step simulation + render)
__PIRATE_TEST__.spawnEnemy(kind,x,y) // scenario setup
__PIRATE_TEST__.placePlayer(x,y,h)   // scenario setup
```

Combat tests always go through the real inputs (`page.keyboard`, pointer events on the touch buttons) and the real rules, collisions and rendering. `playerHp=<n>`, honoured only with `e2e=1`, raises the player's health so time-limit scenarios are deterministic.

The HTML report is in `playwright-report/`. Traces for failures go to `test-results/` (`trace: 'retain-on-failure'`) and open with `npx playwright show-trace <trace.zip>`.

## Deploy

The app is a static Vite build and the mocks run in the browser, so any static host works. A Vercel config is included in [vercel.json](vercel.json):

```bash
npm i -g vercel
vercel login && vercel --prod        # build: npm run build, output: dist
```

`mockServiceWorker.js` is served from the site root with `Service-Worker-Allowed: /`, and any URL you open or reload serves the app. After deploying, paste the URL at the top of this file.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md#architecture). The original art, sounds and atlases are in `assets/`. The subset used at runtime (ships, effects, UI, tile sheets, sounds) is copied to `public/assets/`.
