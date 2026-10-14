import { QueryClient } from '@tanstack/react-query';
import { runtimeConfig } from '@/lib/runtimeConfig';

export const retryDelay = (attempt: number) => Math.min(runtimeConfig.retryBaseDelayMs * 2 ** attempt, 6000);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: runtimeConfig.maxRetries,
      retryDelay,
      staleTime: 10_000,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: runtimeConfig.maxRetries, retryDelay },
  },
});
