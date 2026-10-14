import axios, { type AxiosError } from 'axios';
import { runtimeConfig } from '@/lib/runtimeConfig';
import type { ApiErrorBody, HistoryPage, MatchRecord, RankingPage, RecordMatchResponse } from './contracts';

export const http = axios.create({
  baseURL: '/api',
  timeout: runtimeConfig.apiTimeoutMs,
  headers: { Accept: 'application/json' },
});

export function describeError(error: unknown): string {
  const e = error as AxiosError<ApiErrorBody>;
  if (e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT') return 'The server took too long to respond.';
  if (e?.response) return e.response.data?.message ?? `The server answered with status ${e.response.status}.`;
  if (e?.request) return 'Could not reach the server. Check your connection.';
  return e instanceof Error ? e.message : 'Unexpected error.';
}

export async function fetchRanking(params: { configKey: string; page: number; pageSize: number }, signal?: AbortSignal) {
  const { data } = await http.get<RankingPage>('/ranking', { params, signal });
  return data;
}

export async function fetchHistory(params: { playerId: string; page: number; pageSize: number }, signal?: AbortSignal) {
  const { data } = await http.get<HistoryPage>('/matches', { params, signal });
  return data;
}

/** Idempotent: the same `matchId` always yields the same stored record. */
export async function postMatch(record: MatchRecord): Promise<RecordMatchResponse> {
  const { data } = await http.post<RecordMatchResponse>('/matches', record, {
    headers: { 'Idempotency-Key': record.matchId },
  });
  return data;
}
