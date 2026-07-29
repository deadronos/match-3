import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { GameEngine } from '../game/engine';

/**
 * Owns a {@link GameEngine} for the lifetime of the component and re-renders
 * whenever the engine's state changes.
 */
export function useGame() {
  // Lazy-init the engine once per mount.
  const engine = useMemo(() => new GameEngine(), []);

  const state = useSyncExternalStore(
    (callback) => engine.subscribe(callback),
    () => engine.state,
    () => engine.state,
  );

  useEffect(() => {
    return () => {
      engine.dispose();
    };
  }, [engine]);

  return { engine, state };
}
