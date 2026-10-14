import { createContext, useContext, type ReactNode } from 'react';
import { useMatchSync } from '@/api/useMatchSync';

const Ctx = createContext<{ retry: () => void }>({ retry: () => undefined });

/** Mounts the match-sync engine once and shares its retry action with the UI. */
export function MatchSyncProvider({ children }: { children: ReactNode }) {
  const { flush } = useMatchSync();
  return <Ctx.Provider value={{ retry: flush }}>{children}</Ctx.Provider>;
}

export const useMatchSyncContext = () => useContext(Ctx);
