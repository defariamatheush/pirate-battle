import { create } from 'zustand';

export type Screen = 'menu' | 'options' | 'match' | 'result';
export type MenuTab = 'home' | 'ranking' | 'history';

interface AppState {
  screen: Screen;
  menuTab: MenuTab;
  /** Increments for every new match so the match screen fully remounts. */
  matchKey: number;
  go: (screen: Screen) => void;
  setMenuTab: (tab: MenuTab) => void;
  startMatch: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'menu',
  menuTab: 'home',
  matchKey: 0,
  go: (screen) => set({ screen }),
  setMenuTab: (menuTab) => set({ menuTab }),
  startMatch: () => set((s) => ({ screen: 'match', matchKey: s.matchKey + 1 })),
}));
