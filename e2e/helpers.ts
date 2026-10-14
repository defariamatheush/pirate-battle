import { expect, test as base, type Locator, type Page } from '@playwright/test';

export interface ShipState { id: number; kind: 'chaser' | 'shooter'; x: number; y: number; heading: number; health: number }
export interface GameState {
  status: 'running' | 'ended';
  endReason: 'time_up' | 'player_destroyed' | null;
  paused: boolean;
  elapsed: number;
  timeLeft: number;
  score: number;
  player: { x: number; y: number; heading: number; speed: number; health: number; cooldowns: { front: number; left: number; right: number } };
  enemies: ShipState[];
  projectiles: { id: number; team: 'player' | 'enemy'; x: number; y: number; damage: number }[];
  islands: { id: string; x: number; y: number; radius: number }[];
  arena: { width: number; height: number };
}

export const SESSION_FIELD = 'Game session time (seconds)';
export const SPAWN_FIELD = 'Enemy spawn time (seconds)';

/** Thin wrapper around the page for driving the real game with the test clock. */
export class Game {
  constructor(readonly page: Page) {}

  async open(query: Record<string, string | number> = {}) {
    const params = new URLSearchParams({
      e2e: '1',
      clock: 'manual',
      seed: '1',
      mockLatency: '0',
      retryDelay: '0',
      retries: '1',
      apiTimeout: '1500',
      ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
    });
    await this.page.goto(`/?${params}`);
    await expect(this.page.getByTestId('main-menu')).toBeVisible();
  }

  /** Saves options through the real Options screen. */
  async setOptions(session: number, spawn: number) {
    await this.page.getByTestId('options-button').click();
    await this.page.getByLabel(SESSION_FIELD).fill(String(session));
    await this.page.getByLabel(SPAWN_FIELD).fill(String(spawn));
    await this.page.getByTestId('save-options').click();
    await expect(this.page.getByTestId('options-status')).toContainText('saved');
    await this.page.getByTestId('back-button').click();
    await expect(this.page.getByTestId('main-menu')).toBeVisible();
  }

  async play() {
    await this.page.getByTestId('play-button').click();
    await this.waitForMatch();
  }

  async waitForMatch() {
    await expect(this.page.getByTestId('hud')).toBeVisible({ timeout: 20_000 });
    await this.page.waitForFunction(() => !!window.__PIRATE_TEST__);
  }

  state(): Promise<GameState> {
    return this.page.evaluate(() => (window.__PIRATE_TEST__!.getState() as GameState));
  }
  advance(ms: number) {
    // The hooks disappear with the arena once the match is over, so a late call is a no-op.
    return this.page.evaluate((n) => window.__PIRATE_TEST__?.advance(n), ms);
  }
  /** Advance in slices so the UI/game loop can observe intermediate states. */
  async advanceBy(totalMs: number, sliceMs = 250) {
    for (let t = 0; t < totalMs; t += sliceMs) await this.advance(Math.min(sliceMs, totalMs - t));
  }
  spawnEnemy(kind: 'chaser' | 'shooter', x: number, y: number, heading = 0) {
    return this.page.evaluate(([k, a, b, c]) => window.__PIRATE_TEST__!.spawnEnemy(k as 'chaser', a as number, b as number, c as number), [kind, x, y, heading] as const);
  }
  placePlayer(x: number, y: number, heading: number) {
    return this.page.evaluate(([a, b, c]) => window.__PIRATE_TEST__!.placePlayer(a, b, c), [x, y, heading] as const);
  }
  /** Runs the simulated clock to the end of the session and waits for the result screen. */
  async finishByTime() {
    const s = await this.state();
    await this.advanceBy(s.timeLeft * 1000 + 500, 1000);
    await expect(this.page.getByTestId('result-screen')).toBeVisible();
  }
}

export const test = base.extend<{ game: Game; consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      // Browser-level network noise from deliberately failing mock scenarios is expected.
      if (/Failed to load resource/i.test(text)) return;
      errors.push(text);
    });
    await use(errors);
  },
  game: async ({ page, consoleErrors }, use) => {
    await use(new Game(page));
    expect(consoleErrors, 'no unhandled console errors').toEqual([]);
  },
});

export { expect };

export async function holdKey(page: Page, key: string, fn: () => Promise<void>) {
  await page.keyboard.down(key);
  try {
    await fn();
  } finally {
    await page.keyboard.up(key);
  }
}

export function pointerDown(el: Locator, pointerId: number) {
  return el.dispatchEvent('pointerdown', { pointerId, pointerType: 'touch', isPrimary: pointerId === 1, bubbles: true });
}
export function pointerUp(el: Locator, pointerId: number) {
  return el.dispatchEvent('pointerup', { pointerId, pointerType: 'touch', isPrimary: pointerId === 1, bubbles: true });
}

/** Clicks "Next page" until the last page of the active list is shown. */
export async function goToLastPage(page: Page) {
  const next = page.getByRole('button', { name: 'Next page' });
  const indicator = page.getByTestId('page-indicator');
  for (let i = 0; i < 60; i++) {
    const text = (await indicator.textContent()) ?? '';
    const [, current, total] = /Page (\d+) of (\d+)/.exec(text) ?? [];
    if (!current || current === total) return;
    await next.click({ timeout: 3000 }).catch(() => undefined);
    await expect(indicator).not.toHaveText(text, { timeout: 5000 }).catch(() => undefined);
  }
}
