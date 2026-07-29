import type { GameState } from '../game/types';
import { IconPause, IconShuffle } from './icons';

interface HUDProps {
  state: GameState;
  best: number;
  onShuffle: () => void;
  onTogglePause: () => void;
}

export function HUD({ state, best, onShuffle, onTogglePause }: HUDProps) {
  const status = state.paused ? 'Paused' : state.playing ? 'Playing' : 'Idle';
  return (
    <>
      <div className="hud">
        <div className="stat highlight">
          <div className="label">Level</div>
          <div className="value">{state.level}</div>
          <div className="sub">Target · {state.target.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="label">Score</div>
          <div className="value">{state.score.toLocaleString()}</div>
          <div className="sub">Best · {Math.max(best, state.score).toLocaleString()}</div>
        </div>
        <div className="stat warn">
          <div className="label">Moves</div>
          <div className="value">{state.moves}</div>
          <div className="sub">
            {Math.min(state.score, state.target).toLocaleString()} / {state.target.toLocaleString()}
          </div>
        </div>
        <div className="stat">
          <div className="label">Combo</div>
          <div className="value">×{state.combo.toFixed(1).replace(/\.0$/, '')}</div>
          <div className="sub">
            {state.cascadesThisTurn} cascade{state.cascadesThisTurn === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="left">
          <span className={`pill${state.paused ? ' paused' : ''}`}>
            <span className="dot" />
            {status}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="icon-btn"
            onClick={onShuffle}
            disabled={!state.playing || state.paused || state.busy}
            title="Shuffle board"
            type="button"
          >
            <IconShuffle />
          </button>
          <button
            className="icon-btn"
            onClick={onTogglePause}
            disabled={!state.playing}
            title="Pause (P)"
            type="button"
          >
            <IconPause />
          </button>
        </div>
      </div>
    </>
  );
}
