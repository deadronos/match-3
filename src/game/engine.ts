import {
  applyGravity,
  detectBombTrigger,
  emptyGrid,
  findAnyValidMove,
  findMatches,
  generateBoard,
  inBounds,
  isAdjacent,
  refillEmpty,
  resolveClears,
  samePos,
} from './board';
import { ANIM, GRID, levelConfig, numTypes, SCORING } from './config';
import { loadBest, saveBest } from './storage';
import type { Cell, GameState, Gem, Position } from './types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function createInitialState(): GameState {
  return {
    grid: emptyGrid(),
    nextId: 1,
    score: 0,
    level: 1,
    moves: 30,
    target: 1000,
    combo: 1,
    cascadesThisTurn: 0,
    selected: null,
    cursor: { r: 3, c: 3 },
    busy: false,
    paused: false,
    playing: false,
    gameOver: false,
    screen: 'start',
    hint: null,
    levelBonus: null,
    poppedGems: new Set<number>(),
    lastPop: null,
    spawned: [],
  };
}

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
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private hintHideTimer: ReturnType<typeof setTimeout> | null = null;

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

    const trig = detectBombTrigger(gemA, gemB);

    if (trig) {
      this.consumeMove();
      await this.activateBomb(trig);
      await this.chainLoop();
      this.finishTurn();
      return;
    }

    // No bomb interaction — check for a match.
    const match = findMatches(this.state.grid);
    if (match.cells.size === 0) {
      // Invalid swap — swap back, shake, undo.
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
    await this.clearAndCascade(match);
    await this.chainLoop();
    this.finishTurn();
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
    const { toClear, upgradeMap } = resolveClears(match, this.state.grid);

    // Score.
    const earned = Math.floor(SCORING.basePerGem * toClear.size * this.state.combo);
    const firstGroup = match.groups[0]!;
    const popR = firstGroup.cells[0]?.r ?? 0;
    const popC = Math.round(
      firstGroup.cells.reduce((s, p) => s + p.c, 0) / firstGroup.cells.length,
    );
    const big = toClear.size >= 5 || this.state.combo >= 2;

    // Mark matched cells as popped (kept in the grid for the pop animation).
    const poppedGems: Gem[] = [];
    for (const k of toClear) {
      const [rStr, cStr] = k.split(',');
      const r = Number(rStr);
      const c = Number(cStr);
      const gem = this.state.grid[r]?.[c] ?? null;
      if (gem) poppedGems.push(gem);
    }

    this.setState((s) => ({
      ...s,
      score: s.score + earned,
      poppedGems: new Set(poppedGems.map((g) => g.id)),
      lastPop: { r: popR, c: popC, big, text: `+${earned.toLocaleString()}` },
    }));

    await sleep(ANIM.pop + 20);

    // Apply upgrades to surviving gems.
    this.mutateGrid((g) => {
      for (const k of toClear) {
        const [rStr, cStr] = k.split(',');
        const r = Number(rStr);
        const c = Number(cStr);
        g[r]![c] = null;
      }
      for (const [k, up] of upgradeMap.entries()) {
        const [rStr, cStr] = k.split(',');
        const r = Number(rStr);
        const c = Number(cStr);
        const existing = g[r]?.[c] ?? null;
        if (existing) {
          g[r]![c] = { ...existing, special: up.special };
        }
      }
    });
    this.setState((s) => ({ ...s, poppedGems: new Set<number>() }));

    // Gravity.
    await this.runGravity();

    // Refill.
    await this.runRefill();
  }

  private async runGravity(): Promise<void> {
    // Compute moves; clone the grid so React sees the change.
    const next = this.state.grid.map((row) => row.slice());
    const moves = applyGravity(next);
    this.setState((s) => ({ ...s, grid: next }));
    if (moves.length === 0) return;
    await sleep(ANIM.fall);
  }

  private async runRefill(): Promise<void> {
    const types = numTypes(this.state.level);
    const next = this.state.grid.map((row) => row.slice());
    const spawned = refillEmpty(next, types, () => this.state.nextId++);
    this.setState((s) => ({
      ...s,
      grid: next,
      spawned: spawned.map((sp) => ({ id: sp.gem.id, fromR: sp.fromR, toR: sp.toR, c: sp.col })),
    }));
    if (spawned.length === 0) return;
    await sleep(ANIM.fall);
    this.setState((s) => ({ ...s, spawned: [] }));
  }

  private async activateBomb(trig: {
    bomb: Gem;
    target: Gem | null;
    double: boolean;
  }): Promise<void> {
    if (trig.double) {
      // Clear everything.
      const cells: Gem[] = [];
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const g = this.state.grid[r]?.[c] ?? null;
          if (g) cells.push(g);
        }
      }
      this.setState((s) => ({
        ...s,
        score: s.score + SCORING.bombFullClearBonus,
        poppedGems: new Set(cells.map((g) => g.id)),
        lastPop: {
          r: 3,
          c: 3,
          big: true,
          text: `+${SCORING.bombFullClearBonus.toLocaleString()}`,
        },
      }));
      await sleep(ANIM.pop + 20);
      this.mutateGrid((g) => {
        for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) g[r]![c] = null;
      });
      this.setState((s) => ({ ...s, poppedGems: new Set<number>() }));
      await this.runGravity();
      await this.runRefill();
      return;
    }

    const target = trig.target!;
    const cells: Gem[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const g = this.state.grid[r]?.[c] ?? null;
        if (g && g.type === target.type) cells.push(g);
      }
    }
    const bonus = SCORING.bombColorBonus + cells.length * SCORING.bombColorPerGem;
    this.setState((s) => ({
      ...s,
      score: s.score + bonus,
      poppedGems: new Set(cells.map((g) => g.id)),
      lastPop: {
        r: Math.floor(GRID / 2),
        c: Math.floor(GRID / 2),
        big: true,
        text: `+${bonus.toLocaleString()}`,
      },
    }));
    await sleep(ANIM.pop + 20);
    this.mutateGrid((g) => {
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const cell = g[r]?.[c] ?? null;
          if (cell && cell.type === target.type) g[r]![c] = null;
        }
      }
    });
    this.setState((s) => ({ ...s, poppedGems: new Set<number>() }));
    await this.runGravity();
    await this.runRefill();
  }

  private finishTurn(): void {
    this.setState((s) => ({ ...s, busy: false }));

    const { score, target, moves } = this.state;

    if (score >= target) {
      const bonus = moves * SCORING.moveRemainingBonus;
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
    if (moves <= 0) {
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
    this.cancelHint();
    if (!this.state.playing || this.state.paused || this.state.gameOver) return;
    this.hintTimer = setTimeout(() => {
      if (this.state.busy || !this.state.playing || this.state.paused) return;
      const move = findAnyValidMove(this.state.grid);
      if (move) {
        this.setState((s) => ({ ...s, hint: move }));
        this.hintHideTimer = setTimeout(() => {
          this.setState((s) => ({ ...s, hint: null }));
        }, ANIM.hintVisible);
      }
    }, ANIM.hintDelay);
  }

  private cancelHint(): void {
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
    if (this.hintHideTimer) {
      clearTimeout(this.hintHideTimer);
      this.hintHideTimer = null;
    }
    if (this.state.hint) this.setState((s) => ({ ...s, hint: null }));
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
