import { GRID } from './config';
import type { Cell, Gem, MatchGroup, MatchInfo, Position, Special } from './types';

/** Pos -> "r,c" key, used in Sets for O(1) lookup. */
export const posKey = (p: Position): string => `${p.r},${p.c}`;

export const inBounds = (r: number, c: number): boolean => r >= 0 && r < GRID && c >= 0 && c < GRID;

export const samePos = (a: Position | null, b: Position | null): boolean =>
  a !== null && b !== null && a.r === b.r && a.c === b.c;

export const isAdjacent = (a: Position, b: Position): boolean =>
  (a.r === b.r && Math.abs(a.c - b.c) === 1) || (a.c === b.c && Math.abs(a.r - b.r) === 1);

/** The unit-step neighbor of `a` in the direction of `b`, or null if `b`
 *  is not exactly one step away. Used for keyboard-driven swap intent. */
export function dirBetween(a: Position, b: Position): Position | null {
  const dr = b.r - a.r;
  const dc = b.c - a.c;
  if (Math.abs(dr) + Math.abs(dc) !== 1) return null;
  return { r: a.r + dr, c: a.c + dc };
}

export function emptyGrid(): Cell[][] {
  return Array.from({ length: GRID }, () => new Array<Cell>(GRID).fill(null));
}

/** Allocate a new grid with random gems, avoiding immediate 3-in-a-row. */
export function generateBoard(types: number, nextId: () => number): Cell[][] {
  const grid = emptyGrid();
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      let guard = 0;
      let type: number;
      do {
        type = Math.floor(Math.random() * types);
        guard++;
      } while (
        guard < 30 &&
        ((c >= 2 && grid[r]?.[c - 1]?.type === type && grid[r]?.[c - 2]?.type === type) ||
          (r >= 2 && grid[r - 1]?.[c]?.type === type && grid[r - 2]?.[c]?.type === type))
      );
      grid[r]![c] = { id: nextId(), type, special: null };
    }
  }
  return grid;
}

/** Decide if a run of length `len` in direction `dir` should spawn a special. */
export function specialFor(len: number, dir: 'h' | 'v'): Special | null {
  if (len >= 5) return 'bomb';
  if (len === 4) return dir === 'h' ? 'striped-h' : 'striped-v';
  return null;
}

/**
 * Find all matches in the grid.
 *
 * Both horizontal and vertical runs of 3+ same-color gems are returned.
 * Each run becomes a {@link MatchGroup} with a possible {@link Special} upgrade
 * at the middle of the run.
 */
export function findMatches(grid: Cell[][]): MatchInfo {
  const groups: MatchGroup[] = [];
  const seen = new Set<string>();

  // Horizontal runs.
  for (let r = 0; r < GRID; r++) {
    let runStart = 0;
    for (let c = 1; c <= GRID; c++) {
      const row = grid[r]!;
      const start = row[runStart]!;
      const cur = c < GRID ? row[c]! : null;
      const same = cur !== null && start !== null && cur.type === start.type;
      if (!same) {
        const len = c - runStart;
        if (len >= 3) {
          const cells: Position[] = [];
          for (let k = runStart; k < c; k++) cells.push({ r, c: k });
          const special = specialFor(len, 'h');
          const upgradeAt = special ? (cells[Math.floor(cells.length / 2)] ?? null) : null;
          groups.push({ cells, type: start.type, special, upgradeAt });
          for (const p of cells) seen.add(posKey(p));
        }
        runStart = c;
      }
    }
  }

  // Vertical runs.
  for (let c = 0; c < GRID; c++) {
    let runStart = 0;
    for (let r = 1; r <= GRID; r++) {
      const start = grid[runStart]![c]!;
      const cur = r < GRID ? grid[r]![c]! : null;
      const same = cur !== null && start !== null && cur.type === start.type;
      if (!same) {
        const len = r - runStart;
        if (len >= 3) {
          const cells: Position[] = [];
          for (let k = runStart; k < r; k++) cells.push({ r: k, c });
          const special = specialFor(len, 'v');
          const upgradeAt = special ? (cells[Math.floor(cells.length / 2)] ?? null) : null;
          groups.push({ cells, type: start.type, special, upgradeAt });
          for (const p of cells) seen.add(posKey(p));
        }
        runStart = r;
      }
    }
  }

  return { groups, cells: seen };
}

/**
 * Given a list of match groups, return the set of cells to clear.
 *
 * Resolves:
 *  - `upgradeAt` cells (kept in place, transform into a special piece).
 *  - Triggered specials (striped clears a row/col, bomb clears 3x3).
 *
 * The returned `upgradeMap` records cells that should transform rather than
 * be destroyed.
 */
export function resolveClears(
  match: MatchInfo,
  grid: Cell[][],
): { toClear: Set<string>; upgradeMap: Map<string, { special: Special; type: number }> } {
  const toClear = new Set<string>();
  const upgradeMap = new Map<string, { special: Special; type: number }>();

  for (const g of match.groups) {
    for (const cell of g.cells) toClear.add(posKey(cell));
    if (g.upgradeAt) {
      const k = posKey(g.upgradeAt);
      toClear.delete(k);
      upgradeMap.set(k, { special: g.special!, type: g.type });
    }
  }

  // Expand clears to include triggered special patterns.
  const extra = new Set<string>();
  for (const k of toClear) {
    const [rStr, cStr] = k.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    const gem = grid[r]?.[c] ?? null;
    if (!gem) continue;
    if (gem.special === 'striped-h') {
      for (let i = 0; i < GRID; i++) extra.add(`${r},${i}`);
    } else if (gem.special === 'striped-v') {
      for (let i = 0; i < GRID; i++) extra.add(`${i},${c}`);
    } else if (gem.special === 'bomb') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (inBounds(rr, cc)) extra.add(`${rr},${cc}`);
        }
      }
    }
  }
  for (const k of extra) toClear.add(k);

  return { toClear, upgradeMap };
}

/**
 * Apply gravity: each column collapses to the bottom, gems slide down.
 * Returns the list of (gem, newRow) pairs for gems that actually moved.
 * No-op moves (a gem that was already at the bottom) are not included.
 */
export function applyGravity(grid: Cell[][]): Array<{ gem: Gem; col: number; toR: number }> {
  const moves: Array<{ gem: Gem; col: number; toR: number }> = [];
  for (let c = 0; c < GRID; c++) {
    const stack: Array<{ gem: Gem; fromR: number }> = [];
    for (let r = GRID - 1; r >= 0; r--) {
      const g = grid[r]?.[c] ?? null;
      if (g) {
        stack.push({ gem: g, fromR: r });
        grid[r]![c] = null;
      }
    }
    let writeR = GRID - 1;
    for (const { gem, fromR } of stack) {
      grid[writeR]![c] = gem;
      if (writeR !== fromR) moves.push({ gem, col: c, toR: writeR });
      writeR--;
    }
  }
  return moves;
}

/**
 * Fill empty cells from above the board. New gems start at `startR = -k` so
 * they animate in from above the visible area.
 *
 * Returns the spawned gems and their destination rows for the animation layer.
 */
export function refillEmpty(
  grid: Cell[][],
  types: number,
  nextId: () => number,
): Array<{ gem: Gem; col: number; fromR: number; toR: number }> {
  const spawned: Array<{ gem: Gem; col: number; fromR: number; toR: number }> = [];
  for (let c = 0; c < GRID; c++) {
    const emptyRows: number[] = [];
    for (let r = 0; r < GRID; r++) {
      if (!grid[r]?.[c]) emptyRows.push(r);
    }
    for (let i = 0; i < emptyRows.length; i++) {
      const finalR = emptyRows[i]!;
      const startOffset = emptyRows.length - i;
      const startR = -startOffset;
      const type = Math.floor(Math.random() * types);
      const gem: Gem = { id: nextId(), type, special: null };
      grid[finalR]![c] = gem;
      spawned.push({ gem, col: c, fromR: startR, toR: finalR });
    }
  }
  return spawned;
}

/** Find any valid move on the board. Returns the two cells or null. */
export function findAnyValidMove(grid: Cell[][]): [Position, Position] | null {
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (c < GRID - 1 && wouldMatch(grid, r, c, r, c + 1))
        return [
          { r, c },
          { r, c: c + 1 },
        ];
      if (r < GRID - 1 && wouldMatch(grid, r, c, r + 1, c))
        return [
          { r, c },
          { r: r + 1, c },
        ];
    }
  }
  return null;
}

/** Test whether swapping (r1,c1) with (r2,c2) would create a match. */
export function wouldMatch(
  grid: Cell[][],
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): boolean {
  const a = grid[r1]?.[c1] ?? null;
  const b = grid[r2]?.[c2] ?? null;
  if (!a || !b) return false;
  grid[r1]![c1] = b;
  grid[r2]![c2] = a;
  const m = findMatches(grid);
  grid[r1]![c1] = a;
  grid[r2]![c2] = b;
  return m.cells.size > 0;
}

/** Find the position of a gem in the grid by id. */
export function findGemPos(grid: Cell[][], id: number): Position | null {
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r]?.[c]?.id === id) return { r, c };
    }
  }
  return null;
}

/** Whether a bomb is part of (or the only piece in) a swap. */
export function detectBombTrigger(
  a: Gem,
  b: Gem,
): { bomb: Gem; target: Gem | null; double: boolean } | null {
  if (a.special === 'bomb' && !b.special) {
    return { bomb: a, target: b, double: false };
  }
  if (b.special === 'bomb' && !a.special) {
    return { bomb: b, target: a, double: false };
  }
  if (a.special === 'bomb' && b.special === 'bomb') {
    return { bomb: a, target: null, double: true };
  }
  return null;
}
