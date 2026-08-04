/**
 * Keyboard input bindings for the game.
 *
 * Mounts a single `keydown` listener while the component is alive and
 * translates keys into engine intents.
 */
import { useEffect } from 'react';
import { dirBetween, isAdjacent } from '../game/board';
import { GRID } from '../game/config';
import type { GameEngine } from '../game/engine';

/**
 * Wire keyboard input to engine intents.
 *
 * Bindings:
 *  - Arrows: move cursor (and auto-swap if cursor lands adjacent to selection)
 *  - Space / Enter: select / swap (depending on whether a selection exists)
 *  - P / Esc: toggle pause
 *  - R: restart level (with confirm)
 *
 * The hook is a no-op when the engine is busy, paused, or the game is over
 * (except for P/Esc/R, which always work when a board is on screen).
 *
 * @param engine The game engine to send intents to.
 */
export function useKeyboardInput(engine: GameEngine): void {
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      const { state } = engine;
      const key = ev.key;

      if (key === 'p' || key === 'P' || key === 'Escape') {
        if (
          state.screen === 'start' ||
          state.screen === 'levelComplete' ||
          state.screen === 'gameOver'
        ) {
          return;
        }
        engine.togglePause();
        ev.preventDefault();
        return;
      }

      if (key === 'r' || key === 'R') {
        if (state.busy) return;
        if (state.screen === 'start') return;
        if (typeof window !== 'undefined' && window.confirm('Restart this level?')) {
          engine.restartLevel();
        }
        return;
      }

      if (!state.playing || state.paused || state.busy || state.gameOver) return;

      let dr = 0;
      let dc = 0;
      if (key === 'ArrowUp') dr = -1;
      else if (key === 'ArrowDown') dr = 1;
      else if (key === 'ArrowLeft') dc = -1;
      else if (key === 'ArrowRight') dc = 1;
      else if (key === ' ' || key === 'Enter') {
        if (state.selected) {
          const drc = dirBetween(state.selected, state.cursor);
          if (drc) void engine.swap(state.selected, drc);
          else engine.clearSelection();
        } else {
          engine.selectAt(state.cursor);
        }
        ev.preventDefault();
        return;
      } else {
        return;
      }

      ev.preventDefault();
      const newR = Math.max(0, Math.min(GRID - 1, state.cursor.r + dr));
      const newC = Math.max(0, Math.min(GRID - 1, state.cursor.c + dc));

      if (state.selected) {
        if (
          isAdjacent(state.selected, { r: newR, c: newC }) &&
          !(state.selected.r === newR && state.selected.c === newC)
        ) {
          const sel = state.selected;
          engine.clearSelection();
          engine.setCursor({ r: newR, c: newC });
          void engine.swap(sel, { r: newR, c: newC });
          return;
        }
        engine.setCursor({ r: newR, c: newC });
      } else {
        engine.setCursor({ r: newR, c: newC });
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [engine]);
}
