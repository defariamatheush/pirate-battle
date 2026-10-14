# Architecture

Pirate Battle is a React and PixiJS game. React owns the menus, forms, dialogs and HUD. PixiJS owns the arena. The game rules live in a plain TypeScript simulation that knows nothing about either. Ranking and match history go through Axios and TanStack Query to a REST API simulated with MSW.

```
src/
  config/gameplay.ts        typed gameplay configuration, option limits and validation
  game/
    sim/                    pure rules (no DOM, no Pixi, no wall clock): Simulation, geometry, map, rng, types
    render/                 Pixi: asset loading (assets.ts) and the scene (GameRenderer.ts)
    input/InputController   keyboard and touch to held controls
    GameSession.ts          glue: Application, ticker, input, audio, pause, UI mirror, lifecycle
    audio.ts, perf.ts, testHooks.ts
  state/                    zustand stores: navigation, options, last result, live match UI mirror
  api/                      contracts, Axios client, TanStack Query hooks, durable pending queue, sync hook
  mocks/                    MSW worker, handlers, scenarios, localStorage "database", deterministic fixtures
  ui/                       React screens and components
e2e/                        Playwright tests and __screenshots__ baselines
scripts/profile.mjs         performance and memory profiling
```

## 1. React and PixiJS integration

`MatchScreen` is the only React component that touches the game. A `useEffect` loads the textures, constructs a `GameSession`, awaits `session.init()` and calls `session.dispose()` in its cleanup.

The Pixi `Application` is created inside `GameSession.init()` with `resizeTo: host`, `autoDensity` and `resolution = min(devicePixelRatio, 2)`. Its canvas is appended to a host `div` that React renders but never re-renders into. Nothing in the arena is React state, so the game never triggers a React render.

Effects run twice in development under Strict Mode, so the lifecycle is written to survive that. `dispose()` is idempotent and can be called while `init()` is still awaiting `Application.init`. When `init()` resumes it re-checks a `disposed` flag and destroys the orphaned application. A `cancelled` flag in the effect covers the texture-loading phase. `e2e/strict-mode.spec.ts` runs the game against the dev server and checks for a single session, one canvas and one ticker per match.

The session mirrors only what the DOM shows into a zustand store (`matchStore`): score, whole seconds left, health, phase and a polite announcement string. `syncUi()` compares against the current store values and writes only when something changed. The HUD therefore renders when the clock ticks over or a value changes, never once per frame, and fine-grained selectors keep each HUD part independent.

The touch controls are plain React buttons that call `session.pressControl` and `session.releaseControl` from pointer events. They only mutate the `InputController`, which the simulation reads. Each button tracks its own pointer ids, so several fingers work at once.

The arena is a fixed 1600x900 world. The surrounding box (`.arena-box`) is a CSS 16:9 box that fits the viewport. The canvas follows it through a `ResizeObserver` and `renderer.resize`, and the renderer scales the world container uniformly (`scale = min(w/1600, h/900)`, centred). Input comes from keys and buttons rather than pointer coordinates on the canvas, so there are no coordinate transforms to get wrong, and the arena limits are in world space. The world container is masked to the arena, so nothing outside it is drawn.

On phones a match is landscape only. In portrait (up to 820 px wide) a "rotate your device" guard covers the arena and the session pauses. Rotating back leaves the pause dialog up until the player resumes.

## 2. Simulation cycle

`Simulation` (`src/game/sim/simulation.ts`) is deterministic. `step(dt)` with `dt = 1/60 s` is the only way time passes, and randomness comes from a seeded mulberry32 (`?seed=`). The session drives it with a fixed-timestep accumulator:

```
frame:  accumulator += min(deltaMS, 100) / 1000
        while accumulator >= STEP (max 12 iterations): sim.step(STEP)
        renderer.render(alpha = accumulator / STEP)      // interpolates previous to current transform
```

Movement, cooldowns, projectile life, spawn timers and the match clock all advance by `STEP`, so behaviour does not depend on the display's frame rate (60, 120 or 144 Hz). Long stalls are clamped to 100 ms and the backlog is dropped after 12 steps, so a hidden tab cannot cause a fast-forward.

Inside a step the order is: player, enemies (AI and movement), spawns, projectiles (swept hits), ship contacts, cleanup, end checks.

The player has a forward throttle (acceleration and drag), rotation, and three independent weapon cooldowns for the front, port and starboard guns. Fire inputs are held states and the cooldown decides when a shot happens. `InputController.poll()` latches taps shorter than a frame, so they still fire once.

The Chaser steers toward the player at its turn rate and always moves at full speed. On contact it damages the player and is destroyed with `byPlayer = false`, which gives no point.

The Shooter steers toward the player and advances until `preferredRange`. It fires its front cannon when `distance <= attackRange` and the heading error is within `aimTolerance`. It starts with part of its cooldown already spent, so it never fires on its spawn frame.

Enemies avoid islands in `avoidIslands`. They look ahead along their desired heading and veer away from circles that intersect that path, more strongly the closer the circle is. The hard collision resolution described below is the safety net.

A spawn timer fires every `spawn.intervalSeconds`, with the first spawn at t = interval. The first two spawns are one Chaser and then one Shooter (`guaranteeEachType`), and after that a weighted random picks the type. Spawn points are sampled up to 60 times until one is inside the arena margin, at least `minDistanceFromPlayer` (480) from the player, and clear of islands and other ships. If none is found the timer stays armed and retries on the next step. `maxAlive` holds spawns while the sea is full.

The match ends when `elapsed >= sessionSeconds` or when the player's health reaches 0, and the player's death takes priority. `status` becomes `ended`, input is cleared and every later `step()` is a no-op, so nothing moves, shoots, damages, spawns or scores. The recorded duration is `elapsed`, which counts active play only.

Pause is a session concern. While paused the session neither accumulates time nor steps the simulation, so cooldowns, the clock and projectiles freeze. On resume the accumulator is zeroed and all input state (keys, touches and latched taps) is cleared. `InputController.capture` is off while paused so the dialog behaves like a normal page. Auto-pause triggers are `visibilitychange` (hidden), window `blur` and portrait orientation.

## 3. Collisions

Ships and islands are circles, projectiles are points swept along segments, and the arena is an axis-aligned rectangle.

| Pair | Handling |
| --- | --- |
| Ship and arena | Position clamped to `[radius, size - radius]` |
| Ship and island | Position pushed out along the contact normal, with speed reduced in proportion to how head-on the impact was, so ships slide along coasts instead of sticking |
| Ship and ship | Soft separation, where enemies yield more than the player. A Chaser touching the player is the exception: it deals damage and explodes |
| Projectile and island or ship | Swept segment-circle test over the step (`segmentCircleHit`), earliest hit wins, so fast shells cannot tunnel through targets |
| Projectile and bounds or lifetime | Removed when it leaves the arena or its `ttl` expires (range is speed times lifetime) |

A projectile is marked `alive = false` the moment it hits, so damage is applied exactly once. Dead ships are filtered out at the end of every step and skipped by all loops, so they deal no damage, fire no shots and take part in no collisions. Player shells only test enemies, and enemy shells only test the player.

## 4. Resource management

Textures load once through `Assets.load`, one call per file, so progress is exact and a failure names the file. They are cached in `assets.ts` and shared by all matches. Pixi drops a failed load from its cache, so Try again is a real retry. Dense displays use retina variants (`resolution: 2`) where they exist, which means the UI and the tiles. The match screen shows a progress bar and a retryable error state, and combat starts only after every texture has resolved.

Each match owns the `Application`, the ticker callback, the `ResizeObserver`, the window and document listeners, the `InputController` listeners, the audio loops and the renderer's display objects. `dispose()` removes the listeners, disconnects the observer, stops the loops, removes the ticker callback, destroys the renderer (ship views, health bar textures, the generated ring texture and the world container) and destroys the application with `children: true` and `texture: false`, since textures are shared.

Projectile sprites are pooled. Short effects (bursts, rings and wrecks) are destroyed when they end. Health bar fill textures are sub-frames of the shared texture and are destroyed with their ship. Keyboard listeners exist only between `attach()` and `detach()`, which is while a match is mounted.

`scripts/profile.mjs` measures heap, DOM nodes and listener counts after a forced GC across 5 start, play and quit cycles. The results are in `docs/PERFORMANCE.md`.

## 5. Local persistence

| Key | Content |
| --- | --- |
| `pb.options.v1` | Validated game options (session seconds, spawn interval) |
| `pb.lastResult.v1` | Last completed match and whether the server confirmed it |
| `pb.pending.v1` | Durable queue of matches not yet confirmed, which survives a refresh |
| `pb.player.v1` | Anonymous player identity (`id`, `name`) |
| `pb.muted.v1` | Sound preference |
| `pb.mock.db.v1` | Confirmed records of the mock backend |
| `pb.mock.scenario.v1` | Selected mock scenario, seed and latency scale |

Every read is validated and wrapped in try/catch, and unavailable storage falls back to in-memory defaults. A match in progress is deliberately not persisted. Reloading or leaving the arena abandons it, and abandoned matches never reach the ranking or the history.

## 6. Ranking and history

### Contracts

The contracts are in `src/api/contracts.ts`:

```
MatchRecord    { matchId, playerId, playerName, endedAt (ISO), score, durationSeconds, endReason, config{sessionSeconds, spawnIntervalSeconds, configKey} }
GET  /api/ranking?configKey&page&pageSize   -> Page<RankingEntry>   (RankingEntry = MatchRecord & { rank })
GET  /api/matches?playerId&page&pageSize    -> Page<MatchRecord>    (history, newest first)
POST /api/matches   (Idempotency-Key: matchId) -> { record, created }   201 the first time, 200 for a known matchId
Page<T>        { items, page, pageSize, total, totalPages }
```

The ranking compares only matches with the same `configKey` (`s<session>-i<spawn>`). The order is total and deterministic: score descending, duration ascending (the faster match wins), `endedAt` ascending, then `matchId` ascending (`compareRanking`, covered by unit tests). The rivals are fixtures generated from the config key with a seeded generator, so every configuration has a populated board.

### Client

One Axios instance (`api/client.ts`) serves `/api` with its timeout taken from `VITE_API_TIMEOUT_MS`. It forwards `signal`, so TanStack Query can cancel superseded requests.

The queries (`api/queries.ts`) use the keys `['ranking', configKey, page]` and `['history', playerId, page]`. They set `placeholderData: keepPreviousData`, so paging does not flicker, and `refetchOnMount: 'always'`, so a tab revalidates every time it is shown while the cached data stays visible. An "Updating..." hint covers the background refetch. Retries use exponential back-off, and the loading, empty and error states have accessible roles.

A refetch of the same key cancels the request in flight, and a response always belongs to its own key, so a late answer cannot replace newer data. The test `late responses never overwrite newer data` covers this with the Out-of-order scenario.

Recording lives in `api/useMatchSync.ts`. When a match ends, the session builds a `MatchRecord` with a fresh `matchId`. `MatchScreen` puts it in the durable pending queue (`syncStore`, mirrored to `pb.pending.v1`) and stores it as the last result. `useMatchSync`, mounted once at the root, sends queued items through a `useMutation`, serialised with a mutation `scope` and retried with back-off. On success it removes the item, marks the last result as registered and invalidates `['ranking']` and `['history']`, so both tabs refresh. On failure the item stays queued with `status: 'failed'` and its message.

Duplicates are prevented at three levels. The queue de-duplicates by `matchId`. An in-flight set stops repeated clicks and effects from sending twice. The server is idempotent on `matchId`, so a timeout after the commit followed by a retry returns the existing record (`created: false`) and inserts nothing.

Items still `sending` at boot are re-queued and sent automatically. The menu shows a "not saved yet" banner with Retry now, the result screen shows the status with a Retry button, and the `online` event retries failed items. A pending record never blocks a new match, and none of this touches the arena or the options.

### MSW

Handlers, fixtures and contracts are shared by development, tests and the production build, and the worker starts in `main.tsx` before React renders. Confirmed records persist in `localStorage`, so both tabs see the same state across refreshes. Scenarios, chosen with `?scenario=<id>` or the in-app Network scenarios dialog, change latency and failures (the README lists them). Randomness is seeded with `?mockSeed=` and latency is scalable, with `?mockLatency=0` used in tests.

GET handlers compute their body when the request arrives and deliver it after the scenario's delay, which is what makes slow replies stale snapshots. The Timeout after saving scenario inserts the record and never answers the first POST.

## 7. Accessibility

The menu is a `tablist` with roving tabindex and Arrow, Home and End keys. Every control is a real `<button>` or `<input>` with a label, and `:focus-visible` draws a 3 px focus ring.

The pause and Network dialogs use native `<dialog>` with `showModal()`, which gives a focus trap, an inert background and Esc. Initial focus goes to the primary action and returns to the previous element on close.

The Options fields have labels, `aria-invalid`, `aria-describedby` hints and `role="alert"` error text.

During a match the HUD is `aria-hidden`. A visually hidden status section exposes score, time left and hull as static text. One polite live region announces events only: match start, kills, low hull, the 10-second warning, pause and resume, and the end. It never announces per frame or per second.

Query errors use `role="alert"` and loading uses `role="status"`. Tables have captions and header scopes. Game keys are `preventDefault`-ed only while a match is mounted and not paused. `prefers-reduced-motion` turns off the CSS animations (hit vignette and spinners).

## 8. Balance decisions and limitations

The defaults are a 90 s session, an enemy every 4 s and 100 hp for the player. The front cannon does 25 damage every 0.5 s, and the broadside fires 3 shots of 14 damage every 1.6 s. The Chaser has 30 hp, moves at 150 u/s (the player's maximum is 210 u/s, so it can be outrun) and deals 20 contact damage. The Shooter has 60 hp, fires 8 damage every 1.7 s and has a range of 420. `spawn.maxAlive = 8` keeps the sea readable.

The spawn interval is limited to 1 to 15 seconds. Below 1 s the arena fills faster than a player can react, and above 15 s a 60 s match could contain no Shooter.

Colliders are circles and a ship's hull is longer than its collider, so a bow can overlap a coast by a few pixels. This keeps collisions predictable, cheap and free of tunnelling.

Enemy avoidance is reactive steering, not path-finding, so a Chaser can circle for a while in a pocket between islands. Audio is best-effort WebAudio with no sprite sheets, and it is skipped silently if decoding fails or the browser blocks it.

The test hooks (`?e2e=1`) can observe state, spawn or place entities and drive the clock, but they bypass no rule. Mock persistence uses `localStorage` (about 5 MB), and the mock database holds only the player's own matches.
