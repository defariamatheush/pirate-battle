import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchHistory, fetchRanking } from './client';
import { PAGE_SIZE } from './contracts';

export function useRankingQuery(configKey: string, page: number) {
  return useQuery({
    queryKey: ['ranking', configKey, page],
    queryFn: ({ signal }) => fetchRanking({ configKey, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
    // Always re-validate when the tab is shown again; cached data is displayed meanwhile.
    refetchOnMount: 'always',
  });
}

export function useHistoryQuery(playerId: string, page: number) {
  return useQuery({
    queryKey: ['history', playerId, page],
    queryFn: ({ signal }) => fetchHistory({ playerId, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}
