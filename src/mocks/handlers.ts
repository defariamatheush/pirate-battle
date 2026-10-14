import { HttpResponse, delay, http, type HttpHandler } from 'msw';
import type { MatchRecord } from '@/api/contracts';
import { Rng } from '@/game/sim/rng';
import { db } from './db';
import { bump, getMockSettings, type ScenarioId } from './scenarios';

type Endpoint = 'ranking' | 'history' | 'record';

const BASE_LATENCY_MS = 120;

function latencyMs(endpoint: Endpoint, call: number): number {
  const { scenario, seed, latencyScale } = getMockSettings();
  let ms = BASE_LATENCY_MS;
  switch (scenario) {
    case 'slow':
      ms = 2500;
      break;
    case 'variable-latency':
      ms = new Rng(seed * 7919 + call * 104729 + endpoint.length).range(100, 2000);
      break;
    case 'out-of-order':
      // Odd GET calls are slow, even ones fast, so a newer reply can overtake an older one.
      ms = endpoint !== 'record' && call % 2 === 1 ? 2500 : 80;
      break;
    default:
      break;
  }
  return ms * latencyScale;
}

const error = (status: number, code: string, message: string) => HttpResponse.json({ code, message }, { status });

/** Applies the failure side of the active scenario. Returns a response to short-circuit, or null. */
function failureFor(endpoint: Endpoint, scenario: ScenarioId): Response | null | 'hang' {
  switch (scenario) {
    case 'network-error':
      return HttpResponse.error();
    case 'http-4xx':
      return endpoint === 'record' ? error(422, 'invalid_record', 'The match record was rejected.') : error(429, 'rate_limited', 'Too many requests.');
    case 'http-5xx':
      return error(500, 'internal_error', 'Internal server error.');
    case 'timeout':
      return endpoint === 'record' ? null : 'hang';
    case 'ranking-fail':
      return endpoint === 'ranking' ? error(500, 'ranking_unavailable', 'The ranking is unavailable right now.') : null;
    case 'history-fail':
      return endpoint === 'history' ? error(500, 'history_unavailable', 'Your match history is unavailable right now.') : null;
    case 'post-unavailable':
      return endpoint === 'record' ? error(503, 'service_unavailable', 'Match registration is temporarily unavailable.') : null;
    default:
      return null;
  }
}

async function gate(endpoint: Endpoint): Promise<Response | null> {
  const { scenario } = getMockSettings();
  const call = bump(`${endpoint}`);
  await delay(latencyMs(endpoint, call));
  const failure = failureFor(endpoint, scenario);
  if (failure === 'hang') {
    await delay('infinite');
    return null;
  }
  return failure;
}

const num = (v: string | null, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};

function isRecord(v: unknown): v is MatchRecord {
  const r = v as MatchRecord;
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.matchId === 'string' &&
    r.matchId.length > 0 &&
    typeof r.playerId === 'string' &&
    Number.isInteger(r.score) &&
    r.score >= 0 &&
    typeof r.durationSeconds === 'number' &&
    r.durationSeconds >= 0 &&
    (r.endReason === 'time_up' || r.endReason === 'player_destroyed') &&
    typeof r.config?.configKey === 'string'
  );
}

export const handlers: HttpHandler[] = [
  http.get('/api/ranking', async ({ request }) => {
    const { scenario } = getMockSettings();
    const u = new URL(request.url);
    const configKey = u.searchParams.get('configKey');
    // The body is computed when the request arrives, then delivered after the scenario's latency.
    // That is what makes slow, out-of-order replies "stale" snapshots.
    const fixtures = scenario === 'empty' ? 0 : scenario === 'many-pages' ? 200 : 26;
    const body = configKey ? db.ranking(configKey, num(u.searchParams.get('page'), 1), num(u.searchParams.get('pageSize'), 8), fixtures) : null;
    const short = await gate('ranking');
    if (short) return short;
    if (!body) return error(400, 'bad_request', 'configKey is required.');
    return HttpResponse.json(body);
  }),

  http.get('/api/matches', async ({ request }) => {
    const { scenario } = getMockSettings();
    const u = new URL(request.url);
    const playerId = u.searchParams.get('playerId');
    const fixtures = scenario === 'many-pages' ? 40 : 0;
    const body = playerId ? db.history(playerId, 'You', num(u.searchParams.get('page'), 1), num(u.searchParams.get('pageSize'), 8), fixtures) : null;
    const short = await gate('history');
    if (short) return short;
    if (!body) return error(400, 'bad_request', 'playerId is required.');
    return HttpResponse.json(body);
  }),

  http.post('/api/matches', async ({ request }) => {
    const call = bump('record-post');
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return error(400, 'bad_request', 'Invalid match record.');
    const { scenario } = getMockSettings();

    if (scenario === 'post-timeout-after-commit' && call === 1) {
      // The server commits the record but the response never reaches the client.
      db.insert(body);
      await delay('infinite');
      return HttpResponse.json({ record: body, created: true });
    }

    const short = await gate('record');
    if (short) return short;
    const { record, created } = db.insert(body);
    return HttpResponse.json({ record, created }, { status: created ? 201 : 200 });
  }),

  // Game assets: the "assets-flaky" scenario fails the first request per ship image.
  http.get('*/assets/png/*/ships/*.png', ({ request }) => {
    if (getMockSettings().scenario !== 'assets-flaky') return undefined;
    const n = bump(`asset:${new URL(request.url).pathname}`);
    return n === 1 ? new HttpResponse(null, { status: 503 }) : undefined;
  }),
];
