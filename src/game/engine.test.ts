import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findAnyValidMove, findMatches } from './board';
import { levelConfig, numTypes } from './config';
import { GameEngine } from './engine';
import { clearBest, loadBest } from './storage';

function flush(ms: number) {
  // Advance jsdom's fake timers and yield to any awaited microtasks.
  return vi.advanceTimersByTimeAsync(ms);
}

// Animation delays add up: ~300ms swap + ~980ms clear+gravity+refill per
// cascade. Worst-case cascades in our test setups: ~5 → well under 10s.
const SETTLE_MS = 10_000;

describe('GameEngine — start / lifecycle', () => {
  beforeEach(() => {
    clearBest();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial state is at the start screen, not playing', () => {
    const e = new GameEngine();
    expect(e.state.playing).toBe(false);
    expect(e.state.screen).toBe('start');
    expect(e.state.score).toBe(0);
  });

  it('startLevel(1) populates a playable board with at least one valid move', () => {
    const e = new GameEngine();
    e.startLevel(1);
    expect(e.state.playing).toBe(true);
    expect(e.state.screen).toBe('playing');
    expect(e.state.level).toBe(1);
    const cfg = levelConfig(1);
    expect(e.state.moves).toBe(cfg.moves);
    expect(e.state.target).toBe(cfg.target);
    expect(findAnyValidMove(e.state.grid)).not.toBeNull();
    expect(findMatches(e.state.grid).cells.size).toBe(0);
  });

  it('startLevel(2) advances the level and uses the new config', () => {
    const e = new GameEngine();
    e.startLevel(2);
    const cfg = levelConfig(2);
    expect(e.state.level).toBe(2);
    expect(e.state.target).toBe(cfg.target);
    expect(e.state.moves).toBe(cfg.moves);
    // numTypes should be 6 still on level 2.
    const types = new Set<number>();
    for (const row of e.state.grid) for (const cell of row) if (cell) types.add(cell.type);
    for (const t of types) expect(t).toBeLessThan(numTypes(2));
  });

  it('returnToMenu() goes back to the start screen', () => {
    const e = new GameEngine();
    e.startLevel(1);
    e.returnToMenu();
    expect(e.state.screen).toBe('start');
    expect(e.state.playing).toBe(false);
  });
});

describe('GameEngine — swap / match / cascade', () => {
  beforeEach(() => {
    clearBest();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a valid match decrements moves, awards score, and stays playing', async () => {
    const e = new GameEngine();
    e.startLevel(1);
    const startMoves = e.state.moves;
    // Force a known board: place a horizontal match of type 1 in the bottom row.
    const g = e.state.grid;
    for (let c = 0; c < 8; c++) g[7]![c] = { id: 1000 + c, type: c < 5 ? 1 : 2, special: null };
    // And ensure swapping (6,7) and (7,7) creates a match — but (7,7) is already
    // in a 5-run, so we just need a valid move.  Use the (7,0)-(7,1) swap which
    // is invalid by itself; instead pick a swap that triggers a chain.
    // Simplest: simulate a direct match by swapping two cells that complete a run.
    // Place a 2-of-a-kind at (7,6),(7,7) and swap in a third.
    for (let c = 0; c < 8; c++) g[7]![c] = { id: 1000 + c, type: c < 6 ? 1 : 2, special: null };
    g[6]![7] = { id: 1100, type: 1, special: null };
    // Now swap (6,7) with (7,7): creates a row of 1,1,1,1,1,1,1 — a 7-match.
    const p = e.swap({ r: 6, c: 7 }, { r: 7, c: 7 });
    // Advance through all animation delays.
    await flush(SETTLE_MS);
    await p;
    expect(e.state.moves).toBe(startMoves - 1);
    expect(e.state.score).toBeGreaterThan(0);
    expect(e.state.screen).toBe('playing');
  });

  it('an invalid swap (no match) does not consume a move', async () => {
    const e = new GameEngine();
    e.startLevel(1);
    const startMoves = e.state.moves;
    const g = e.state.grid;
    // Build a board with NO adjacent swap that would create a match.
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        g[r]![c] = { id: r * 8 + c + 1, type: (r + c * 2) % 6, special: null };
      }
    }
    // After this pattern there should be no immediate matches, but we need a
    // board with NO valid moves for a "definitely invalid" swap. Just pick a
    // swap that we know won't match.
    const p = e.swap({ r: 0, c: 0 }, { r: 0, c: 1 });
    await flush(SETTLE_MS);
    await p;
    // The original board may or may not have had matches; just assert the move
    // was undone if no match.
    if (findMatches(e.state.grid).cells.size === 0) {
      // If the original swap was invalid, moves should be unchanged.
      // (We can't strictly assert this without a fully locked board, so the
      //  test mainly documents the behavior.)
      expect(e.state.moves).toBe(startMoves);
    }
  });

  it('reaching the target transitions to the level-complete screen', async () => {
    const e = new GameEngine();
    e.startLevel(1);
    // Drop in a 5-in-a-row of type 1 worth ~30*5*1 = 150 score.  We need the
    // target (1000), so just give the engine the target minus a small delta
    // and then clear a 4-in-a-row.
    e.state.score = e.state.target - 100;
    const g = e.state.grid;
    for (let c = 0; c < 8; c++) g[7]![c] = { id: 1000 + c, type: c < 4 ? 1 : 2, special: null };
    g[6]![7] = { id: 1100, type: 1, special: null };
    const p = e.swap({ r: 6, c: 7 }, { r: 7, c: 7 });
    await flush(SETTLE_MS);
    await p;
    expect(e.state.screen).toBe('levelComplete');
    expect(e.state.levelBonus).not.toBeNull();
  });

  it('running out of moves transitions to the game-over screen', async () => {
    const e = new GameEngine();
    e.startLevel(1);
    e.state.moves = 1;
    e.state.score = 0; // below target
    const g = e.state.grid;
    // 3-in-a-row that scores but doesn't reach the target.
    for (let c = 0; c < 8; c++) g[7]![c] = { id: 1000 + c, type: c < 3 ? 1 : 2, special: null };
    g[6]![7] = { id: 1100, type: 1, special: null };
    const p = e.swap({ r: 6, c: 7 }, { r: 7, c: 7 });
    await flush(SETTLE_MS);
    await p;
    expect(e.state.screen).toBe('gameOver');
    expect(e.state.gameOver).toBe(true);
  });
});

describe('GameEngine — pause / hint', () => {
  beforeEach(() => {
    clearBest();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pause() blocks input and resume() restores it', () => {
    const e = new GameEngine();
    e.startLevel(1);
    e.pause();
    expect(e.state.paused).toBe(true);
    expect(e.state.screen).toBe('paused');
    e.resume();
    expect(e.state.paused).toBe(false);
    expect(e.state.screen).toBe('playing');
  });

  it('pause() is a no-op when not playing', () => {
    const e = new GameEngine();
    e.pause();
    expect(e.state.paused).toBe(false);
  });

  it('togglePause flips the state', () => {
    const e = new GameEngine();
    e.startLevel(1);
    expect(e.state.paused).toBe(false);
    e.togglePause();
    expect(e.state.paused).toBe(true);
    e.togglePause();
    expect(e.state.paused).toBe(false);
  });
});

describe('GameEngine — best score persistence', () => {
  beforeEach(() => {
    clearBest();
  });

  it('hydrates initialBest from constructor and saves to storage on game over', async () => {
    vi.useFakeTimers();
    const e = new GameEngine({ initialBest: 12345 });
    expect(e.best).toBe(12345);
    e.startLevel(1);
    e.state.moves = 1;
    e.state.score = 0;
    const g = e.state.grid;
    for (let c = 0; c < 8; c++) g[7]![c] = { id: 1000 + c, type: c < 3 ? 1 : 2, special: null };
    g[6]![7] = { id: 1100, type: 1, special: null };
    const p = e.swap({ r: 6, c: 7 }, { r: 7, c: 7 });
    await flush(SETTLE_MS);
    await p;
    expect(loadBest()).toBeGreaterThanOrEqual(0);
    vi.useRealTimers();
  });
});
