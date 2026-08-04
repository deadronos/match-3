/**
 * React glue for the {@link GameEngine}.
 *
 * Owns a single engine instance for the lifetime of the calling component
 * and re-renders the component every time the engine's state changes.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { GameEngine } from '../game/engine';

/**
 * Bind a {@link GameEngine} to a React component.
 *
 * Returns:
 *  - `engine` — the engine instance. Call intent methods on it.
 *  - `state`  — the engine's current state. Safe to render directly.
 *
 * The engine is created once (lazy) on mount and `dispose()` is called on
 * unmount to clear any pending timers.
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
