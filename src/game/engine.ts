/**
 * GameEngine owns the entire game state machine.
 *
 * The engine is decoupled from React: it exposes a public `state` and a
 * `subscribe(listener)` API. The UI just renders `state` and calls intent
 * methods (swap, pause, restart, ...). All animation timing is owned by the
 * engine; the UI never has to coordinate transitions.
 *
 * Why: makes the engine 100% unit-testable (no React, no DOM), and keeps the
 * React layer small and "view-only".
 */
import { sleep } from './animation';
import {
  detectBombTrigger,
  findAnyValidMove,
  findMatches,
  generateBoard,
  inBounds,
  isAdjacent,
  samePos,
} from './board';
import { resolveBombTrigger } from './bombs';
import { ANIM, GRID, levelConfig, numTypes, SCORING } from './config';
import { createHintController } from './hints';
import { getTurnCompletionState } from './progression';
import { createInitialState } from './state';
import { loadBest, saveBest } from './storage';
import { resolveTurnSequence } from './turns';
import type { Cell, GameState, Gem, Position } from './types';

/**
 * The top-level game object. One instance lives for the whole session.
 *
 * Shape:
 *  - `state` — the current {@link GameState}; React reads this.
 *  - `best` — the all-time best score (mirrored from localStorage).
 *  - public intent methods: `startLevel`, `swap`, `pause`, `resume`, …
 *  - `subscribe(listener)` — returns an unsubscribe function.
 */
export class GameEngine {
  /** Read-only view of the game. Mutate through intent methods. */
  state: GameState;
  /** All-time best score (mirrored from localStorage at construction). */
  best: number;

  /** Set of re-render listeners. Each one fires on every state change. */
  private listeners = new Set<() => void>();
  /** Owns the "show a hint after a few seconds of idle" timer. */
  private hintController = createHintController();

  /** Build a fresh engine. Pass `initialBest` to skip reading localStorage
   *  (used by tests). */
  constructor(opts?: { initialBest?: number }) {
    this.state = createInitialState();
    this.best = opts?.initialBest ?? loadBest();
  }

  // ---- subscription -----------------------------------------------------

  /**
   * Register a listener. The listener is called with no arguments on every
   * state change. Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Fire all listeners. Called after `setState`. */
  private notify(): void {
    for (const l of this.listeners) l();
  }

  /** Replace the state via an updater function, then notify subscribers. */
  private setState(updater: (s: GameState) => GameState): void {
    this.state = updater(this.state);
    this.notify();
  }

  // ---- public API -------------------------------------------------------

  /** Begin (or restart) a level. Resets score, board, moves, and timers. */
  startLevel(level: number): void {
    this.cancelHint();
    const cfg = levelConfig(level);
    this.setState((s) => ({
      ...s,
      level,
      score: 0,
      moves: cfg.moves,
      target: cfg.target,
      combo: 1,
      cascadesThisTurn: 0,
      selected: null,
      cursor: { r: 3, c: 3 },
      busy: false,
      paused: false,
      playing: true,
      gameOver: false,
      screen: 'playing',
      hint: null,
      levelBonus: null,
      grid: this.makeFreshGrid(level),
      nextId: s.nextId,
    }));
    this.scheduleHint();
  }

  /** Pause the current game (no-op if not playing). */
  pause(): void {
    if (!this.state.playing || this.state.paused) return;
    this.cancelHint();
    this.setState((s) => ({ ...s, paused: true, screen: 'paused' }));
  }

  /** Resume from a paused state. */
  resume(): void {
    if (!this.state.paused) return;
    this.setState((s) => ({ ...s, paused: false, screen: 'playing' }));
    this.scheduleHint();
  }

  /** Toggle pause/resume. */
  togglePause(): void {
    if (this.state.paused) this.resume();
    else this.pause();
  }

  /** Restart the current level. */
  restartLevel(): void {
    this.startLevel(this.state.level);
  }

  /** Advance to the next level. */
  startNextLevel(): void {
    this.startLevel(this.state.level + 1);
  }

  /** Return to the start screen. */
  returnToMenu(): void {
    this.cancelHint();
    this.setState((s) => ({
      ...s,
      playing: false,
      paused: false,
      gameOver: false,
      selected: null,
      screen: 'start',
    }));
  }

  /**
   * Try to swap two adjacent gems. This is the main user action.
   *
   * Handles: bomb triggers, invalid swaps (snaps back), match resolution,
   * scoring, cascades, level/game end. Returns a promise that resolves
   * once the full turn finishes (or snaps back if the swap was invalid).
   */
  async swap(a: Position, b: Position): Promise<void> {
    if (this.state.busy) return;
    if (!isAdjacent(a, b)) return;
    if (!inBounds(a.r, a.c) || !inBounds(b.r, b.c)) return;

    const gemA = this.state.grid[a.r]?.[a.c] ?? null;
    const gemB = this.state.grid[b.r]?.[b.c] ?? null;
    if (!gemA || !gemB) return;

    this.cancelHint();
    this.setState((s) => ({ ...s, busy: true, selected: null }));

    // Swap in the grid (logical).
    this.mutateGrid((g) => {
      g[a.r]![a.c] = gemB;
      g[b.r]![b.c] = gemA;
    });
    await sleep(ANIM.swap + 20);

    await this.resolveSwapOutcome(a, b, gemA, gemB);
  }

  /**
   * Decide what happens after the swap animation: bomb trigger, valid
   * match, or invalid swap (snap back).
   */
  private async resolveSwapOutcome(a: Position, b: Position, gemA: Gem, gemB: Gem): Promise<void> {
    const trig = detectBombTrigger(gemA, gemB);

    if (trig) {
      this.consumeMove();
      await this.activateBomb(trig);
      await this.chainLoop();
      this.finishTurn();
      return;
    }

    const match = findMatches(this.state.grid);
    if (match.cells.size === 0) {
      this.mutateGrid((g) => {
        g[a.r]![a.c] = gemA;
        g[b.r]![b.c] = gemB;
      });
      await sleep(ANIM.swap + 20);
      this.setState((s) => ({ ...s, busy: false }));
      this.scheduleHint();
      return;
    }

    this.consumeMove();
    this.setState((s) => ({ ...s, combo: 1, cascadesThisTurn: 0 }));
    await this.resolveMatchChain(match);
    this.finishTurn();
  }

  /** Run the first clear, then drain remaining cascades. */
  private async resolveMatchChain(match: ReturnType<typeof findMatches>): Promise<void> {
    await this.clearAndCascade(match);
    await this.chainLoop();
  }

  /**
   * Force-shuffle the current board (e.g. via the toolbar). Pops every gem
   * and then drops a brand-new board in.
   */
  async shuffle(): Promise<void> {
    if (this.state.busy) return;
    if (!this.state.playing || this.state.paused) return;
    this.cancelHint();
    this.setState((s) => ({ ...s, busy: true, selected: null }));

    // Pop everything currently on the board.
    const popped: Gem[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const g = this.state.grid[r]?.[c] ?? null;
        if (g) popped.push(g);
      }
    }
    if (popped.length > 0) {
      this.setState((s) => ({ ...s, poppedGems: new Set(popped.map((g) => g.id)) }));
      await sleep(ANIM.pop + 20);
    }

    const fresh = this.makeFreshGrid(this.state.level);
    this.setState((s) => ({
      ...s,
      grid: fresh,
      poppedGems: new Set<number>(),
      busy: false,
    }));
    this.scheduleHint();
  }

  /** Update cursor position (keyboard). Clamps to the board. */
  setCursor(p: Position): void {
    if (!inBounds(p.r, p.c)) return;
    this.setState((s) => ({ ...s, cursor: p }));
  }

  /** Update selection (clicked gem). Clears any previous selection. */
  selectAt(p: Position): void {
    if (!inBounds(p.r, p.c)) return;
    const g = this.state.grid[p.r]?.[p.c] ?? null;
    if (!g) return;
    this.cancelHint();
    this.setState((s) => ({ ...s, selected: p }));
  }

  /** Drop the current selection (cursor moves away or click empty cell). */
  clearSelection(): void {
    this.setState((s) => ({ ...s, selected: null }));
  }

  /**
   * Decide between selecting / deselecting / swapping based on current state.
   *
   *  - no selection  -> select at `p`
   *  - same as current selection -> deselect
   *  - adjacent to selection -> swap
   *  - otherwise -> move selection to `p`
   */
  async handleSelectOrSwap(p: Position): Promise<void> {
    if (this.state.busy || !this.state.playing || this.state.paused || this.state.gameOver) {
      return;
    }
    if (!this.state.selected) {
      this.selectAt(p);
      return;
    }
    if (samePos(this.state.selected, p)) {
      this.clearSelection();
      return;
    }
    if (isAdjacent(this.state.selected, p)) {
      const a = this.state.selected;
      const b = p;
      this.clearSelection();
      await this.swap(a, b);
      return;
    }
    this.selectAt(p);
  }

  // ---- internals --------------------------------------------------------

  /** Build a fresh board for `level`. Retries if the board has no moves. */
  private makeFreshGrid(level: number): Cell[][] {
    const types = numTypes(level);
    let grid = generateBoard(types, () => this.state.nextId++);
    let safety = 10;
    while (!findAnyValidMove(grid) && safety-- > 0) {
      grid = generateBoard(types, () => this.state.nextId++);
    }
    return grid;
  }

  /** Run `fn` on a shallow-clone of the grid and publish the result.
   *  Cloning is required so React notices the change. */
  private mutateGrid(fn: (g: Cell[][]) => void): void {
    const next: Cell[][] = this.state.grid.map((row) => row.slice());
    fn(next);
    this.setState((s) => ({ ...s, grid: next }));
  }

  /** Subtract one from `moves`, clamped at 0. */
  private consumeMove(): void {
    this.setState((s) => ({ ...s, moves: Math.max(0, s.moves - 1) }));
  }

  /** Repeatedly clear+cascade until no more matches exist. */
  private async chainLoop(): Promise<void> {
    let match = findMatches(this.state.grid);
    while (match.cells.size > 0) {
      this.setState((s) => ({
        ...s,
        cascadesThisTurn: s.cascadesThisTurn + 1,
        combo: Math.min(SCORING.comboMax, s.combo + SCORING.comboStep),
      }));
      await this.clearAndCascade(match);
      match = findMatches(this.state.grid);
    }
  }

  /** Run one clear-and-cascade step (turn sequence). */
  private async clearAndCascade(match: ReturnType<typeof findMatches>): Promise<void> {
    await resolveTurnSequence(this.state, match, (updater) => this.setState(updater));
  }

  /** Handle a bomb swap: clear matching color (or whole board), then chain. */
  private async activateBomb(trig: {
    bomb: Gem;
    target: Gem | null;
    double: boolean;
  }): Promise<void> {
    await resolveBombTrigger(
      trig,
      this.state,
      (updater) => this.setState(updater),
      (fn) => this.mutateGrid(fn),
      async () => {
        await this.clearAndCascade({ groups: [], cells: new Set<string>() });
      },
    );
  }

  /**
   * Called at the end of every turn.
   *
   * Checks for level completion / game over, persists best score, and
   * auto-shuffles the board if no valid moves are left.
   */
  private finishTurn(): void {
    this.setState((s) => ({ ...s, busy: false }));

    const { score } = this.state;
    const completion = getTurnCompletionState(this.state);

    if (completion.shouldCompleteLevel) {
      const bonus = completion.bonus;
      this.best = Math.max(this.best, score + bonus);
      saveBest(this.best);
      this.setState((s) => ({
        ...s,
        score: s.score + bonus,
        levelBonus: bonus,
        screen: 'levelComplete',
        playing: false,
      }));
      return;
    }
    if (completion.shouldEndGame) {
      this.best = Math.max(this.best, score);
      saveBest(this.best);
      this.setState((s) => ({
        ...s,
        screen: 'gameOver',
        playing: false,
        gameOver: true,
      }));
      return;
    }
    // No valid moves? Auto-shuffle.
    if (!findAnyValidMove(this.state.grid)) {
      void this.shuffle();
      return;
    }
    this.scheduleHint();
  }

  // ---- hint -------------------------------------------------------------

  /** Start the idle hint timer (cancels any previous one). */
  private scheduleHint(): void {
    this.hintController.scheduleHint(this.state, (updater) => this.setState(updater));
  }

  /** Cancel the hint timer and clear any visible hint. */
  private cancelHint(): void {
    this.hintController.cancelHint(this.state, (updater) => this.setState(updater));
  }

  // ---- visibility / cleanup --------------------------------------------

  /** Pause automatically when the tab becomes hidden. */
  onVisibilityChange(hidden: boolean): void {
    if (hidden && this.state.playing && !this.state.paused) {
      this.pause();
    }
  }

  /** Permanently dispose timers (e.g. on unmount). */
  dispose(): void {
    this.cancelHint();
    this.listeners.clear();
  }
}
