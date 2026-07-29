import { useEffect } from 'react';
import type { GameEngine } from '../game/engine';

/** Auto-pause the game when the tab is hidden. */
export function useVisibilityPause(engine: GameEngine): void {
  useEffect(() => {
    function onVis() {
      engine.onVisibilityChange(document.hidden);
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [engine]);
}
