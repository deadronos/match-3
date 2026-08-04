/**
 * Tiny wrapper around `localStorage` for the all-time best score.
 *
 * Every function is a no-op when run outside a browser (SSR / tests), and
 * every read/write is wrapped in a try/catch so quota / privacy errors
 * never crash the game.
 */
import { STORAGE_KEY } from './config';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

/** Read the all-time best score from localStorage. Returns 0 if missing. */
export function loadBest(): number {
  if (!isBrowser) return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Persist a new all-time best. Silently no-ops on storage errors. */
export function saveBest(score: number): void {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(score));
  } catch {
    /* ignore quota / privacy errors */
  }
}

/** Test-only / SSR helper to reset the best score. */
export function clearBest(): void {
  if (!isBrowser) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
