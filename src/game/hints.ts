/**
 * "Show a hint after a few seconds of idle" controller.
 *
 * Encapsulated so the engine doesn't have to manage its own timers. The
 * controller owns the show-timer and the hide-timer; the engine just calls
 * `scheduleHint` when the player is idle and `cancelHint` on any action.
 */
import { findAnyValidMove } from './board';
import { ANIM } from './config';
import type { GameState } from './types';

/** Public surface of the hint controller. */
export interface HintController {
  /** Arm the hint timer. Cancels any previous timer first. */
  scheduleHint: (
    state: GameState,
    setState: (updater: (s: GameState) => GameState) => void,
  ) => void;
  /** Cancel any pending hint and clear the visible hint. */
  cancelHint: (state: GameState, setState: (updater: (s: GameState) => GameState) => void) => void;
}

/** Build a fresh hint controller with no timers running. */
export function createHintController(): HintController {
  let hintTimer: ReturnType<typeof setTimeout> | null = null;
  let hintHideTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    scheduleHint(state, setState) {
      this.cancelHint(state, setState);
      if (!state.playing || state.paused || state.gameOver) return;

      hintTimer = setTimeout(() => {
        if (state.busy || !state.playing || state.paused) return;
        const move = findAnyValidMove(state.grid);
        if (move) {
          setState((current) => ({ ...current, hint: move }));
          hintHideTimer = setTimeout(() => {
            setState((current) => ({ ...current, hint: null }));
          }, ANIM.hintVisible);
        }
      }, ANIM.hintDelay);
    },

    cancelHint(state, setState) {
      if (hintTimer) {
        clearTimeout(hintTimer);
        hintTimer = null;
      }
      if (hintHideTimer) {
        clearTimeout(hintHideTimer);
        hintHideTimer = null;
      }
      if (state.hint) {
        setState((current) => ({ ...current, hint: null }));
      }
    },
  };
}
