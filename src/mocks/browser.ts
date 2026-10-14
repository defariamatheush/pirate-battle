import { setupWorker } from 'msw/browser';
import { db } from './db';
import { handlers } from './handlers';
import { getMockSettings, initMockSettings, resetMockSettings, updateMockSettings } from './scenarios';

export const worker = setupWorker(...handlers);

export async function startMocks(): Promise<void> {
  initMockSettings();
  await worker.start({
    onUnhandledFrame: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
}

/** Restores the pristine state: confirmed records, scenario, counters. */
export function resetMocks(): void {
  db.reset();
  resetMockSettings();
}

declare global {
  interface Window {
    __MOCK__?: {
      settings: typeof getMockSettings;
      set: typeof updateMockSettings;
      reset: () => void;
      confirmedCount: () => number;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__MOCK__ = { settings: getMockSettings, set: updateMockSettings, reset: resetMocks, confirmedCount: () => db.count() };
}
