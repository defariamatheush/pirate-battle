import { create } from 'zustand';
import { DEFAULT_OPTIONS, validateOptions, type GameOptions } from '@/config/gameplay';
import { STORAGE_KEYS, readJson, writeJson } from '@/lib/storage';

const isOptions = (v: unknown): v is GameOptions =>
  typeof v === 'object' && v !== null && validateOptions(v as GameOptions).ok;

interface OptionsState {
  options: GameOptions;
  save: (next: GameOptions) => void;
}

export const useOptionsStore = create<OptionsState>((set) => ({
  options: readJson<GameOptions>(STORAGE_KEYS.options, DEFAULT_OPTIONS, isOptions),
  save: (next) => {
    writeJson(STORAGE_KEYS.options, next);
    set({ options: next });
  },
}));
