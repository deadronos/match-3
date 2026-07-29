import { useCallback } from 'react';
import './App.css';
import { Board } from './components/Board';
import { Footer } from './components/Footer';
import { HUD } from './components/HUD';
import {
  GameOverOverlay,
  LevelCompleteOverlay,
  PauseOverlay,
  StartOverlay,
} from './components/Overlays';
import { findGemPos } from './game/board';
import type { Position } from './game/types';
import { useGame } from './hooks/useGame';
import { useKeyboardInput } from './hooks/useKeyboardInput';
import { useVisibilityPause } from './hooks/useVisibilityPause';

export default function App() {
  const { engine, state } = useGame();
  useKeyboardInput(engine);
  useVisibilityPause(engine);

  const handleGemPointerDown = useCallback(
    (gemId: number, ev: React.PointerEvent<HTMLDivElement>) => {
      ev.preventDefault();
      const pos = findGemPos(state.grid, gemId);
      if (!pos) return;
      void engine.handleSelectOrSwap(pos);
    },
    [engine, state.grid],
  );

  const start = useCallback(() => engine.startLevel(1), [engine]);
  const resume = useCallback(() => engine.resume(), [engine]);
  const togglePause = useCallback(() => engine.togglePause(), [engine]);
  const restart = useCallback(() => engine.restartLevel(), [engine]);
  const next = useCallback(() => engine.startNextLevel(), [engine]);
  const menu = useCallback(() => engine.returnToMenu(), [engine]);
  const shuffle = useCallback(() => {
    void engine.shuffle();
  }, [engine]);

  return (
    <div className="app">
      <div className="game">
        <HUD state={state} best={engine.best} onShuffle={shuffle} onTogglePause={togglePause} />
        <Board state={state} onGemPointerDown={handleGemPointerDown} />
        <Footer />
      </div>

      <StartOverlay show={state.screen === 'start'} onStart={start} />
      <PauseOverlay
        show={state.screen === 'paused'}
        onResume={resume}
        onRestart={restart}
        onMenu={menu}
      />
      <LevelCompleteOverlay
        show={state.screen === 'levelComplete'}
        level={state.level}
        score={state.score}
        bonus={state.levelBonus ?? 0}
        onNext={next}
      />
      <GameOverOverlay
        show={state.screen === 'gameOver'}
        score={state.score}
        best={engine.best}
        hitTarget={state.score >= state.target}
        onRetry={restart}
        onMenu={menu}
      />
    </div>
  );
}

// Re-export Position so tests can use it.
export type { Position };
