# Testing

`npm run test:unit` (Vitest, 13 tests) and `npm run test:e2e` (Playwright: `desktop` 1280×720, `mobile` Pixel 7
landscape with touch, `strict-mode` against the dev server). Each test starts from an isolated browser context.

| # | Brief area | Spec |
|---|---|---|
| 1 | Navigation, validation, persistence of options | `options.spec.ts` |
| 2 | Asset loading, failure, retry | `assets.spec.ts` |
| 3 | Start, movement, rotation, arena limits, islands | `movement.spec.ts` |
| 4 | Front/side fire, damage, cooldown, scoring | `combat.spec.ts` |
| 5 | Chaser, Shooter, spawn interval | `enemies.spec.ts` |
| 6 | End by time/death, frozen simulation, clean restart | `lifecycle.spec.ts` |
| 7 | Pause, focus loss, resume | `pause.spec.ts` |
| 8 | Result screen and persistence | `result.spec.ts` |
| 9 | Abandon, repeated navigation, touch | `navigation.spec.ts`, `touch.spec.ts` |
| 10 | Ranking / history: loading, empty, error, pagination | `ranking-history.spec.ts` |
| 11 | Recording, both tabs, pending recovery | `record.spec.ts` |
| 12 | Timeout-after-commit, no duplicates, stale replies | `record.spec.ts` |
| – | React StrictMode lifecycle | `strict-mode.spec.ts` |
| – | Visual regression (menu, arena, result) | `visual.spec.ts` |

Console errors are asserted empty at the end of every test. The HTML report is in `playwright-report/`; failure traces
are kept in `test-results/` (`retain-on-failure`).
