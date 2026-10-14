# Performance and memory report

Reproduce with `npm run build && npm run profile` (`DPR=2 npm run profile` for a dense display).
Raw data: [profiling/profile.json](profiling/profile.json), [profiling/profile-dpr2.json](profiling/profile-dpr2.json).

## Environment
| | |
| --- | --- |
| Hardware | MacBook Air, Apple M4, 16 GB RAM, macOS (Darwin 25.5) |
| GPU | ANGLE / Metal, Apple M4 (hardware WebGL) |
| Browser | Chromium 156 via Playwright 1.64, headless |
| Build | Production (`vite build`), served by `vite preview` |
| Resolution | 1280×720 viewport, DPR 1 and DPR 2 |
| Match | 180 s session, one enemy per second (`maxAlive` 8), player made invulnerable (`playerHp=1000000`) so all 3 minutes are played; a seeded in-page bot sails, zig-zags and fires front/broadside cannons |

## Frame rate, 3-minute match (real-time clock)
| | DPR 1 | DPR 2 |
|---|---|---|
| Frames | 10 810 | 10 809 |
| Average FPS | 60.0 | 60.0 |
| p95 frame time | 16.7 ms | 16.7 ms |
| p99 frame time | 16.8 ms | 16.8 ms |
| Max frame time | 16.8 ms | 16.8 ms |
| Max simultaneous entities (player + enemies + projectiles) | 18 | 19 |

The display refresh (60 Hz) is the cap; no dropped frames were observed.

## Memory: 5 × (start → play 20 s → quit)
After a forced GC at the menu following each cycle:

| Cycle | JS heap (MB) | DOM nodes | JS listeners |
|---|---|---|---|
| baseline (menu) | 2.96 | 46 | 5 |
| 1 | 7.12 | 245 | 206 |
| 2 | 7.41 | 245 | 206 |
| 3 | 7.57 | 245 | 206 |
| 4 | 7.67 | 245 | 206 |
| 5 | 7.81 | 245 | 206 |

DOM nodes, listeners and documents are **flat** after the first cycle; Pixi display objects during play stay at 91–96
(no accumulation). The first jump is the one-time load of shared textures, React listeners and WebAudio buffers. The
heap still creeps ≈ +0.1–0.3 MB per cycle (decays: +0.29, +0.16, +0.10, +0.14). That is small and sub-linear, likely
Pixi/V8 internal caches; a longer soak (e.g. 50 cycles) would be needed to rule out a slow leak.

## Limitations
* One machine, one browser, headless; no throttled CPU/low-end mobile measurement.
* The bot rarely scores, so kill/explosion effect load is lighter than an expert player would produce.
* Frame times are capped by vsync, so headroom is not measured; use `?perf=1` for a live overlay.
* GPU memory is not measured (Chromium exposes no reliable counter).
