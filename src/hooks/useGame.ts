import { useEffect, useMemo, useState } from 'react';
import { GameEngine } from '../game/engine';
import type { GameState } from '../game/types';

/**
 * Owns a {@link GameEngine} for the lifetime of the component and re-renders
 * whenever the engine's state changes.
 */
export function useGame() {
  // Lazy-init the engine once per mount.
  const engine = useMemo(() => new GameEngine(), []);

  const [state, setState] = useState<GameState>(engine.state);

  useEffect(() => {
    return engine.subscribe(() => {
      setState({ ...engine.state });
    });
  }, [engine]);

  useEffect(() => {
    return () => {
      engine.dispose();
    };
  }, [engine]);

  return { engine, state };
}
