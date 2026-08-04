/**
 * Core types for the match-3 game.
 *
 * The grid is a 2D array (row-major) of {@link Gem} | null. Cells that are
 * "empty" after a match or before gravity completes are null.
 *
 * Gems are identified by a stable `id` (monotonically increasing) so the UI
 * can keep the same DOM/React key across position changes (e.g. when gems
 * fall or swap).
 *
 * This file has no runtime code — only type declarations. It is the shared
 * vocabulary the engine, board logic, and React layer all speak.
 */

/** One cell on the board. Holds a gem, or is null while a slot is empty. */
export type Cell = Gem | null;

/** Row/column pair on the grid. Both `r` and `c` are 0..GRID-1. */
export type Position = { readonly r: number; readonly c: number };

/** Kind of "special" piece a gem can turn into. */
export type Special = 'striped-h' | 'striped-v' | 'bomb';

export interface Gem {
  /** Stable id for React keys and DOM lookup. */
  readonly id: number;
  /** Color index, 0..numTypes-1. */
  type: number;
  /** Optional special piece. */
  special: Special | null;
}

/** Which overlay / game state the player is currently looking at. */
export type Screen = 'start' | 'playing' | 'paused' | 'levelComplete' | 'gameOver';

/** Difficulty knobs for a single level. */
export interface LevelConfig {
  /** Target score to reach to clear the level. */
  readonly target: number;
  /** Number of moves the player has. */
  readonly moves: number;
}

/**
 * The score-related values shown in the HUD. All numbers are pre-formatted
 * here only as plain numbers; the UI handles localization (commas, etc.).
 */
export interface Score {
  /** Current run score. */
  readonly score: number;
  /** All-time best (from localStorage). */
  readonly best: number;
  /** Current cascade combo multiplier (1.0 means no combo). */
  readonly combo: number;
  /** Cascades triggered this turn. */
  readonly cascades: number;
  /** Current level (1-based). */
  readonly level: number;
  /** Remaining moves. */
  readonly moves: number;
  /** Current level target. */
  readonly target: number;
}

/** A floating score popup that should appear at (r, c) on the board. */
export interface ScorePop {
  readonly r: number;
  readonly c: number;
  readonly big: boolean;
  readonly text: string;
}

/** A gem that should be rendered "spawning" from above the board. */
export interface SpawnedGem {
  readonly id: number;
  readonly fromR: number;
  readonly toR: number;
  readonly c: number;
}

/**
 * The full game state. Lives on the {@link GameEngine} and is what React
 * reads to render. Treat it as read-only from the outside; mutate it
 * through engine intent methods.
 */
export interface GameState {
  /** 2D grid of gems; null = empty cell. */
  grid: Cell[][];
  /** Monotonic counter for the next gem id. */
  nextId: number;
  score: number;
  level: number;
  moves: number;
  target: number;
  combo: number;
  cascadesThisTurn: number;
  /** Currently selected gem (mouse / keyboard). */
  selected: Position | null;
  /** Keyboard cursor position. */
  cursor: Position;
  /** True while an animation / chain is in progress. Disables input. */
  busy: boolean;
  paused: boolean;
  playing: boolean;
  gameOver: boolean;
  /** Currently visible screen / overlay. */
  screen: Screen;
  /** Currently highlighted "hint" pair (if any). */
  hint: Position[] | null;
  /** Last level-complete bonus, used to display on the overlay. */
  levelBonus: number | null;
  /** Gems currently in their pop animation (kept in the grid for it). */
  poppedGems: Set<number>;
  /** Most recent score popup. The UI consumes and clears this. */
  lastPop: ScorePop | null;
  /** Gems currently animating in from above the board. */
  spawned: SpawnedGem[];
}

/** A single run of matched gems (3+ in a row). */
export interface MatchGroup {
  /** Every cell in the run. */
  cells: Position[];
  /** The color index these gems share. */
  type: number;
  /** Special piece to spawn at {@link upgradeAt} when the run is consumed. */
  special: Special | null;
  /** Position where the special piece should appear. */
  upgradeAt: Position | null;
}

/** All matches found in a board scan, with deduped cell set for fast lookup. */
export interface MatchInfo {
  groups: MatchGroup[];
  /** Set of "r,c" keys for all matched cells. */
  cells: Set<string>;
}
