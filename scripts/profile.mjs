/**
 * Performance profiling of the optimised build.
 *
 *   npm run build && npm run profile
 *
 * 1. Plays a 3-minute match (180 s session, an enemy every second) in real time with a scripted
 *    bot and records frame rate, frame-time percentiles and entity counts.
 * 2. Runs 5 start → play → quit cycles and records heap / DOM / listener counts after a forced GC.
 * Results are written to docs/profiling/profile.json (and echoed as Markdown).
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { chromium } from '@playwright/test';

const PORT = 4175;
const BASE = `http://localhost:${PORT}`;
const VIEWPORT = { width: 1280, height: 720 };
const DPR = Number(process.env.DPR ?? 1);
const MATCH_SECONDS = Number(process.env.MATCH_SECONDS ?? 180);
const CYCLES = Number(process.env.CYCLES ?? 5);
const CYCLE_SECONDS = Number(process.env.CYCLE_SECONDS ?? 20);

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

/** In-page bot: holds forward, zig-zags, and keeps cannons firing (seeded, deterministic). */
const BOT = () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const down = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }));
  const up = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  down('KeyW');
  let turn = 'KeyD';
  down(turn);
  const timers = [
    setInterval(() => { up(turn); turn = rnd() < 0.5 ? 'KeyA' : 'KeyD'; down(turn); }, 1400),
    setInterval(() => { down('Space'); setTimeout(() => up('Space'), 80); }, 350),
    setInterval(() => { const k = rnd() < 0.5 ? 'KeyQ' : 'KeyE'; down(k); setTimeout(() => up(k), 80); }, 1800),
  ];
  window.__stopBot = () => { timers.forEach(clearInterval); for (const k of ['KeyW', 'KeyA', 'KeyD', 'Space', 'KeyQ', 'KeyE']) up(k); };
};

async function newPage(browser, options) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR, locale: 'en-US', timezoneId: 'UTC' });
  const page = await context.newPage();
  await page.addInitScript((opts) => localStorage.setItem('pb.options.v1', JSON.stringify(opts)), options);
  return { context, page };
}

async function heapSnapshot(client) {
  await client.send('HeapProfiler.collectGarbage');
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return {
    jsHeapUsedMB: +(m.JSHeapUsedSize / 1048576).toFixed(2),
    domNodes: m.Nodes,
    jsEventListeners: m.JSEventListeners,
    documents: m.Documents,
  };
}

async function main() {
  await waitForServer();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const gpu = await (await browser.newPage()).evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });

  // ---- 1. three-minute match ----
  const { page, context } = await newPage(browser, { sessionSeconds: MATCH_SECONDS, spawnIntervalSeconds: 1 });
  await page.goto(`${BASE}/?e2e=1&playerHp=1000000&mockLatency=0`);
  await page.getByTestId('play-button').click();
  await page.getByTestId('hud').waitFor();
  await page.evaluate(BOT);
  const samples = [];
  const started = Date.now();
  while ((Date.now() - started) / 1000 < MATCH_SECONDS - 4) {
    await page.waitForTimeout(15_000);
    const s = await page.evaluate(() => ({ perf: window.__PIRATE_TEST__?.perf(), stats: window.__PIRATE_TEST__?.stats(), state: window.__PIRATE_TEST__?.getState() }));
    if (s.perf) samples.push({ t: Math.round((Date.now() - started) / 1000), fps: +s.perf.avgFps.toFixed(1), enemies: s.stats.enemies, projectiles: s.stats.projectiles, score: s.state.score });
  }
  const final = await page.evaluate(() => ({ perf: window.__PIRATE_TEST__.perf(), stats: window.__PIRATE_TEST__.stats(), state: window.__PIRATE_TEST__.getState() }));
  const match = {
    wallSeconds: Math.round((Date.now() - started) / 1000),
    frames: final.perf.frames,
    avgFps: +final.perf.avgFps.toFixed(1),
    avgFrameMs: +final.perf.avgFrameMs.toFixed(2),
    p95FrameMs: +final.perf.p95FrameMs.toFixed(2),
    p99FrameMs: +final.perf.p99FrameMs.toFixed(2),
    maxFrameMs: +final.perf.maxFrameMs.toFixed(2),
    maxEntities: final.perf.maxEntities,
    rendererStats: final.stats.renderer,
    score: final.state.score,
    samples,
  };
  await context.close();

  // ---- 2. five start → play → quit cycles ----
  const cyc = await newPage(browser, { sessionSeconds: 60, spawnIntervalSeconds: 1 });
  await cyc.page.goto(`${BASE}/?e2e=1&playerHp=1000000&mockLatency=0`);
  const client = await cyc.context.newCDPSession(cyc.page);
  await client.send('Performance.enable');
  const cycles = [];
  cycles.push({ cycle: 0, label: 'menu (baseline)', ...(await heapSnapshot(client)) });
  for (let i = 1; i <= CYCLES; i++) {
    await cyc.page.getByTestId('play-button').click();
    await cyc.page.getByTestId('hud').waitFor();
    await cyc.page.evaluate(BOT);
    await cyc.page.waitForTimeout(CYCLE_SECONDS * 1000);
    const during = await cyc.page.evaluate(() => window.__PIRATE_TEST__?.stats());
    await cyc.page.evaluate(() => window.__stopBot?.());
    await cyc.page.keyboard.press('Escape');
    await cyc.page.getByTestId('quit-button').click();
    await cyc.page.getByTestId('main-menu').waitFor();
    await cyc.page.waitForTimeout(500);
    cycles.push({ cycle: i, label: `after cycle ${i}`, stageChildrenDuringPlay: during?.renderer?.stageChildren, ...(await heapSnapshot(client)) });
  }
  await cyc.context.close();
  await browser.close();

  let chromeVersion = '';
  try { chromeVersion = chromium.name() + ' ' + execSync('npx playwright --version').toString().trim(); } catch { /* ignore */ }
  const result = {
    generatedAt: new Date().toISOString(),
    environment: {
      hardware: `${os.cpus()[0].model}, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM, ${os.platform()} ${os.release()}`,
      gpu,
      browser: `Chromium (Playwright headless, ANGLE/Metal) — ${chromeVersion}`,
      viewport: `${VIEWPORT.width}x${VIEWPORT.height} @ DPR ${DPR}`,
      matchConfig: `${MATCH_SECONDS}s session, enemy every 1 s, player invulnerable (playerHp=1000000) so the full duration is played`,
      build: 'vite build (production), served by vite preview',
    },
    match,
    memoryCycles: { cycleSeconds: CYCLE_SECONDS, cycles },
  };
  mkdirSync('docs/profiling', { recursive: true });
  writeFileSync(`docs/profiling/profile${DPR !== 1 ? `-dpr${DPR}` : ''}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} finally {
  stop();
}
