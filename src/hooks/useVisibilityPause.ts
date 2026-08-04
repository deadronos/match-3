/**
 * Auto-pause when the browser tab is hidden.
 */
import { useEffect } from 'react';
import type { GameEngine } from '../game/engine';

/**
 * Subscribe to `document.visibilitychange` and tell the engine to pause
 * whenever the tab is hidden. Unsubscribes on unmount.
 *
 * The actual pause logic lives on the engine (`onVisibilityChange`) so the
 * rule "only pause if currently playing" stays in one place.
 *
 * @param engine The game engine to notify.
 */
export function useVisibilityPause(engine: GameEngine): void {
  useEffect(() => {
    function onVis() {
      engine.onVisibilityChange(document.hidden);
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [engine]);
}
