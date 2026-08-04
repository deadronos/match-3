/**
 * Modal overlays: start screen, pause, level-complete, and game-over.
 *
 * Each overlay shares the same `OverlayShell` (a centered panel with
 * fade-in). They are conditionally shown by the parent based on
 * `state.screen`.
 */
import { BASE_COLORS } from '../game/config';

interface BrandProps {
  /** Which color dots to show; defaults to the base palette. */
  colors?: readonly { bg: string }[];
}

/** Small row of color swatches used as a brand mark on the start screen. */
function BrandDots({ colors = BASE_COLORS }: BrandProps) {
  return (
    <div className="brand">
      {colors.map((c) => (
        <div
          key={c.bg}
          className="dot"
          style={{ background: c.bg, boxShadow: `0 2px 6px ${c.bg}55` }}
        />
      ))}
    </div>
  );
}

interface OverlayShellProps {
  show: boolean;
  children: React.ReactNode;
}

/** Backdrop + centered panel; toggles its `.show` class for the fade-in. */
function OverlayShell({ show, children }: OverlayShellProps) {
  return <div className={`overlay${show ? ' show' : ''}`}>{children}</div>;
}

interface StartOverlayProps {
  show: boolean;
  onStart: () => void;
}

/** Title screen with a brief "how to play" and a Play button. */
export function StartOverlay({ show, onStart }: StartOverlayProps) {
  return (
    <OverlayShell show={show}>
      <div className="panel">
        <BrandDots />
        <h1>Gems</h1>
        <p>
          Swap adjacent gems to match three or more. Chain cascades for bigger combos. Hit the
          target score before you run out of moves.
        </p>
        <div className="legend">
          <span className="item">
            <span className="swatch" style={{ background: '#4d96ff' }} />
            Match 3+
          </span>
          <span className="item">
            <span className="swatch" style={{ background: '#6bcb77' }} />
            Cascades
          </span>
          <span className="item">
            <span className="swatch" style={{ background: '#9b72cf' }} />
            Specials on 4 / 5
          </span>
        </div>
        <p style={{ marginTop: 14 }}>
          Reach the target to advance. Difficulty ramps with each level.
        </p>
        <div className="row">
          <button className="btn primary" onClick={onStart} type="button">
            Play
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}

interface PauseOverlayProps {
  show: boolean;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

/** Pause menu: resume, restart the level, or return to the title screen. */
export function PauseOverlay({ show, onResume, onRestart, onMenu }: PauseOverlayProps) {
  return (
    <OverlayShell show={show}>
      <div className="panel">
        <h2>Paused</h2>
        <p>Take a breath. The board will be right where you left it.</p>
        <div className="row">
          <button className="btn primary" onClick={onResume} type="button">
            Resume
          </button>
          <button className="btn ghost" onClick={onRestart} type="button">
            Restart Level
          </button>
          <button className="btn ghost" onClick={onMenu} type="button">
            Main Menu
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}

interface LevelCompleteOverlayProps {
  show: boolean;
  level: number;
  score: number;
  bonus: number;
  onNext: () => void;
}

/** Shown when the player reaches the level target. Shows score + bonus. */
export function LevelCompleteOverlay({
  show,
  level,
  score,
  bonus,
  onNext,
}: LevelCompleteOverlayProps) {
  return (
    <OverlayShell show={show}>
      <div className="panel">
        <h2>Level {level} Complete!</h2>
        <p>
          {level >= 7 ? 'Master tier. You absolute legend.' : 'Get ready — next level is harder.'}
        </p>
        <div className="stats">
          <div className="stat">
            <div className="label">Score</div>
            <div className="value">{score.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="label">Bonus</div>
            <div className="value">+{bonus.toLocaleString()}</div>
          </div>
        </div>
        <div className="row">
          <button className="btn primary" onClick={onNext} type="button">
            Next Level
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}

interface GameOverOverlayProps {
  show: boolean;
  score: number;
  best: number;
  /** True if the player actually hit the target before running out of moves. */
  hitTarget: boolean;
  onRetry: () => void;
  onMenu: () => void;
}

/** Shown when the player runs out of moves. Retry or back to menu. */
export function GameOverOverlay({
  show,
  score,
  best,
  hitTarget,
  onRetry,
  onMenu,
}: GameOverOverlayProps) {
  return (
    <OverlayShell show={show}>
      <div className="panel">
        <h2>Out of Moves</h2>
        <p>
          {hitTarget
            ? 'So close — you hit the target but ran out of moves.'
            : "Didn't quite hit the target this time. Try again?"}
        </p>
        <div className="stats">
          <div className="stat">
            <div className="label">Score</div>
            <div className="value">{score.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="label">Best</div>
            <div className="value">{Math.max(best, score).toLocaleString()}</div>
          </div>
        </div>
        <div className="row">
          <button className="btn primary" onClick={onRetry} type="button">
            Try Again
          </button>
          <button className="btn ghost" onClick={onMenu} type="button">
            Main Menu
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}
