import { findAnyValidMove } from './board';
import { ANIM } from './config';
import type { GameState } from './types';

export interface HintController {
  scheduleHint: (
    state: GameState,
    setState: (updater: (s: GameState) => GameState) => void,
  ) => void;
  cancelHint: (state: GameState, setState: (updater: (s: GameState) => GameState) => void) => void;
}

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
