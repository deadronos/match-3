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
export class GameEngine {
  state: GameState;
  /** All-time best score (mirrored from localStorage at construction). */
  best: number;

  private listeners = new Set<() => void>();
  private hintController = createHintController();

  constructor(opts?: { initialBest?: number }) {
    this.state = createInitialState();
    this.best = opts?.initialBest ?? loadBest();
  }

  // ---- subscription -----------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  private setState(updater: (s: GameState) => GameState): void {
    this.state = updater(this.state);
    this.notify();
  }

  // ---- public API -------------------------------------------------------

  /** Begin (or restart) a level. */
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

  /** Try to swap two adjacent gems. Handles bomb triggers, invalid swaps,
   *  match resolution, scoring, cascades, level/game end. */
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

  private async resolveMatchChain(match: ReturnType<typeof findMatches>): Promise<void> {
    await this.clearAndCascade(match);
    await this.chainLoop();
  }

  /** Force-shuffle the current board (e.g. via the toolbar). */
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

  /** Update cursor position (keyboard). */
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

  clearSelection(): void {
    this.setState((s) => ({ ...s, selected: null }));
  }

  /** Decide between selecting / deselecting / swapping based on current state. */
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

  private makeFreshGrid(level: number): Cell[][] {
    const types = numTypes(level);
    let grid = generateBoard(types, () => this.state.nextId++);
    let safety = 10;
    while (!findAnyValidMove(grid) && safety-- > 0) {
      grid = generateBoard(types, () => this.state.nextId++);
    }
    return grid;
  }

  private mutateGrid(fn: (g: Cell[][]) => void): void {
    // Shallow-clone the grid rows so React notices the change.
    const next: Cell[][] = this.state.grid.map((row) => row.slice());
    fn(next);
    this.setState((s) => ({ ...s, grid: next }));
  }

  private consumeMove(): void {
    this.setState((s) => ({ ...s, moves: Math.max(0, s.moves - 1) }));
  }

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

  private async clearAndCascade(match: ReturnType<typeof findMatches>): Promise<void> {
    await resolveTurnSequence(this.state, match, (updater) => this.setState(updater));
  }

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

  private scheduleHint(): void {
    this.hintController.scheduleHint(this.state, (updater) => this.setState(updater));
  }

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
