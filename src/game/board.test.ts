/**
 * Tests for the pure board-logic functions in `./board`.
 *
 * No engine, no React, no async — just hand-built grids and assertions.
 * A small in-file helper builds a "non-matching background" so individual
 * `it()` blocks can layer a known match on top of a clean board.
 */
import { describe, expect, it } from 'vitest';
import {
  applyGravity,
  detectBombTrigger,
  dirBetween,
  emptyGrid,
  findAnyValidMove,
  findGemPos,
  findMatches,
  generateBoard,
  inBounds,
  isAdjacent,
  posKey,
  refillEmpty,
  resolveClears,
  samePos,
  specialFor,
  wouldMatch,
} from './board';
import type { Cell, Gem, Position } from './types';

let idCounter = 0;
/** Allocate the next gem id. Each test gets its own monotonic ids. */
const nextId = () => ++idCounter;

/** Build a bare gem. */
function mkGem(type: number, special: Gem['special'] = null): Gem {
  return { id: nextId(), type, special };
}

/** Place a gem at a specific position. */
function put(
  g: Cell[][],
  r: number,
  c: number,
  type: number,
  special: Gem['special'] = null,
): void {
  g[r]![c] = mkGem(type, special);
}

/**
 * Build a non-matching background. Uses six distinct colors arranged so no
 * 3-in-a-row can form in any row or column. (E.g. a repeating AB pattern —
 * but the rows shift so columns also don't form triples.)
 */
function background(g: Cell[][]): void {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      // 6-color non-matching background: shift by row so columns also stay
      // safe. Adjacent types differ and the period in any direction is 6.
      g[r]![c] = mkGem(((r * 3 + c) % 6) + 1); // types 1..6
    }
  }
}

describe('geometry helpers', () => {
  it('inBounds', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(7, 7)).toBe(true);
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(0, 8)).toBe(false);
  });

  it('samePos', () => {
    expect(samePos({ r: 1, c: 2 }, { r: 1, c: 2 })).toBe(true);
    expect(samePos({ r: 1, c: 2 }, { r: 2, c: 1 })).toBe(false);
    expect(samePos(null, { r: 0, c: 0 })).toBe(false);
    expect(samePos({ r: 0, c: 0 }, null)).toBe(false);
  });

  it('isAdjacent (4-neighbors only)', () => {
    expect(isAdjacent({ r: 0, c: 0 }, { r: 0, c: 1 })).toBe(true);
    expect(isAdjacent({ r: 0, c: 0 }, { r: 1, c: 0 })).toBe(true);
    expect(isAdjacent({ r: 0, c: 0 }, { r: 0, c: 0 })).toBe(false);
    expect(isAdjacent({ r: 0, c: 0 }, { r: 1, c: 1 })).toBe(false);
    expect(isAdjacent({ r: 0, c: 0 }, { r: 0, c: 2 })).toBe(false);
  });

  it('dirBetween returns the unit-step neighbor of a in the direction of b', () => {
    expect(dirBetween({ r: 0, c: 0 }, { r: 0, c: 1 })).toEqual({ r: 0, c: 1 });
    expect(dirBetween({ r: 0, c: 1 }, { r: 0, c: 0 })).toEqual({ r: 0, c: 0 });
    expect(dirBetween({ r: 1, c: 1 }, { r: 2, c: 1 })).toEqual({ r: 2, c: 1 });
    expect(dirBetween({ r: 0, c: 0 }, { r: 1, c: 1 })).toBeNull();
    expect(dirBetween({ r: 0, c: 0 }, { r: 0, c: 0 })).toBeNull();
  });

  it('posKey round-trips', () => {
    expect(posKey({ r: 3, c: 4 })).toBe('3,4');
  });
});

describe('generateBoard', () => {
  it('produces a full 8x8 grid of gems', () => {
    const g = generateBoard(6, nextId);
    expect(g.length).toBe(8);
    for (const row of g) expect(row.length).toBe(8);
    for (const row of g) for (const cell of row) expect(cell).not.toBeNull();
  });

  it('produces no immediate 3-in-a-row (initial state)', () => {
    const g = generateBoard(6, nextId);
    expect(findMatches(g).cells.size).toBe(0);
  });

  it('respects the type count', () => {
    const g = generateBoard(3, nextId);
    const types = new Set<number>();
    for (const row of g) for (const cell of row) if (cell) types.add(cell.type);
    for (const t of types) expect(t).toBeGreaterThanOrEqual(0);
    for (const t of types) expect(t).toBeLessThan(3);
  });
});

describe('specialFor', () => {
  it('returns null for 3', () => {
    expect(specialFor(3, 'h')).toBeNull();
    expect(specialFor(3, 'v')).toBeNull();
  });
  it('returns striped for 4', () => {
    expect(specialFor(4, 'h')).toBe('striped-h');
    expect(specialFor(4, 'v')).toBe('striped-v');
  });
  it('returns bomb for 5+', () => {
    expect(specialFor(5, 'h')).toBe('bomb');
    expect(specialFor(7, 'v')).toBe('bomb');
  });
});

describe('findMatches', () => {
  it('detects a horizontal 3-in-a-row', () => {
    const g = emptyGrid();
    background(g);
    put(g, 0, 0, 7);
    put(g, 0, 1, 7);
    put(g, 0, 2, 7);
    const m = findMatches(g);
    expect(m.cells.size).toBe(3);
    expect(m.cells.has('0,0')).toBe(true);
    expect(m.cells.has('0,1')).toBe(true);
    expect(m.cells.has('0,2')).toBe(true);
  });

  it('detects a vertical 3-in-a-row', () => {
    const g = emptyGrid();
    background(g);
    put(g, 0, 3, 7);
    put(g, 1, 3, 7);
    put(g, 2, 3, 7);
    const m = findMatches(g);
    expect(m.cells.size).toBe(3);
    expect(m.cells.has('0,3')).toBe(true);
    expect(m.cells.has('1,3')).toBe(true);
    expect(m.cells.has('2,3')).toBe(true);
  });

  it('detects an L-shape (horizontal+vertical) as two groups', () => {
    const g = emptyGrid();
    background(g);
    // Horizontal at row 0: (0,0),(0,1),(0,2)
    // Vertical at column 0: (0,0),(1,0),(2,0)
    put(g, 0, 0, 7);
    put(g, 0, 1, 7);
    put(g, 0, 2, 7);
    put(g, 1, 0, 7);
    put(g, 2, 0, 7);
    const m = findMatches(g);
    expect(m.groups.length).toBe(2);
    expect(m.cells.size).toBe(5);
  });

  it('does not double-count a T-intersection', () => {
    const g = emptyGrid();
    background(g);
    // T-shape: horizontal at row 0, vertical going down from (0,1).
    put(g, 0, 0, 7);
    put(g, 0, 1, 7);
    put(g, 0, 2, 7);
    put(g, 1, 1, 7);
    put(g, 2, 1, 7);
    const m = findMatches(g);
    // 5 unique cells, in two groups that share (0,1).
    expect(m.cells.size).toBe(5);
  });

  it('marks special for a 4-run (striped-h), upgrade at the middle', () => {
    const g = emptyGrid();
    background(g);
    put(g, 0, 0, 7);
    put(g, 0, 1, 7);
    put(g, 0, 2, 7);
    put(g, 0, 3, 7);
    const m = findMatches(g);
    expect(m.groups[0]?.special).toBe('striped-h');
    // For a 4-cell run, upgradeAt = cells[Math.floor(4/2)] = cells[2].
    expect(m.groups[0]?.upgradeAt).toEqual({ r: 0, c: 2 });
  });

  it('marks special for a 5-run (bomb)', () => {
    const g = emptyGrid();
    background(g);
    for (let c = 0; c < 5; c++) put(g, 0, c, 7);
    const m = findMatches(g);
    expect(m.groups[0]?.special).toBe('bomb');
    // For a 5-cell run, upgradeAt = cells[Math.floor(5/2)] = cells[2].
    expect(m.groups[0]?.upgradeAt).toEqual({ r: 0, c: 2 });
  });
});

describe('resolveClears', () => {
  it('removes the upgrade cell from the clear set', () => {
    const g = emptyGrid();
    background(g);
    put(g, 0, 0, 7);
    put(g, 0, 1, 7);
    put(g, 0, 2, 7);
    put(g, 0, 3, 7);
    const m = findMatches(g);
    expect(m.groups.length).toBe(1);
    const { toClear, upgradeMap } = resolveClears(m, g);
    // For a 4-cell run, upgradeAt = cells[2] = (0,2).
    expect(m.groups[0]?.upgradeAt).toEqual({ r: 0, c: 2 });
    expect(toClear.has('0,2')).toBe(false);
    expect(toClear.has('0,0')).toBe(true);
    expect(toClear.has('0,1')).toBe(true);
    expect(toClear.has('0,3')).toBe(true);
    expect(upgradeMap.get('0,2')).toEqual({ special: 'striped-h', type: 7 });
  });

  it('expands a striped-h trigger to the full row', () => {
    const g = emptyGrid();
    background(g);
    // 3-of-a-row at the bottom, with the middle carrying a striped-h special.
    put(g, 7, 0, 7);
    put(g, 7, 1, 7);
    put(g, 7, 2, 7, 'striped-h');
    // The remaining 5 cells in row 7 are the background colors (1..6), and
    // the row-0 background breaks any column run.
    const m = findMatches(g);
    expect(m.groups.length).toBe(1);
    const { toClear } = resolveClears(m, g);
    // The 3-match clears, then the striped-h at (7,2) clears the entire row 7.
    for (let c = 0; c < 8; c++) {
      expect(toClear.has(`7,${c}`)).toBe(true);
    }
  });

  it('expands a bomb trigger to a 3x3 area', () => {
    const g = emptyGrid();
    background(g);
    put(g, 7, 0, 7);
    put(g, 7, 1, 7);
    put(g, 7, 2, 7, 'bomb');
    const m = findMatches(g);
    expect(m.groups.length).toBe(1);
    const { toClear } = resolveClears(m, g);
    // 3x3 centered on (7,2): (6,1),(6,2),(6,3),(7,1),(7,2),(7,3).
    // (8,x) is out of bounds.
    expect(toClear.has('6,1')).toBe(true);
    expect(toClear.has('6,2')).toBe(true);
    expect(toClear.has('6,3')).toBe(true);
    expect(toClear.has('7,1')).toBe(true);
    expect(toClear.has('7,2')).toBe(true);
    expect(toClear.has('7,3')).toBe(true);
    // Outside the 3x3 stays untouched.
    expect(toClear.has('7,4')).toBe(false);
    expect(toClear.has('6,0')).toBe(false);
  });
});

describe('applyGravity', () => {
  it('moves gems to the bottom of their column', () => {
    const g = emptyGrid();
    put(g, 0, 0, 0);
    put(g, 3, 0, 1);
    put(g, 6, 0, 2);
    const moves = applyGravity(g);
    // The bottom-most gem stays put (relative), others slide down into the
    // gaps. So: type 2 (was at row 6) ends at row 7, type 1 (row 3) -> row 6,
    // type 0 (row 0) -> row 5. All three moved.
    expect(moves.length).toBe(3);
    expect(g[7]![0]?.type).toBe(2);
    expect(g[6]![0]?.type).toBe(1);
    expect(g[5]![0]?.type).toBe(0);
    expect(g[0]![0]).toBeNull();
    expect(g[4]![0]).toBeNull();
  });

  it('leaves a full column unchanged (no movement recorded)', () => {
    const g = emptyGrid();
    for (let r = 0; r < 8; r++) put(g, r, 3, (r % 3) + 1);
    const before = g.map((row) => row.map((c) => c?.type ?? -1));
    const moves = applyGravity(g);
    expect(moves.length).toBe(0);
    expect(g.map((row) => row.map((c) => c?.type ?? -1))).toEqual(before);
  });
});

describe('refillEmpty', () => {
  it('fills every empty cell with a new gem', () => {
    const g = emptyGrid();
    const spawned = refillEmpty(g, 4, nextId);
    expect(spawned.length).toBe(64);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) expect(g[r]![c]).not.toBeNull();
  });

  it('reports fromR negative (above the board) and toR in the grid', () => {
    const g = emptyGrid();
    const spawned = refillEmpty(g, 3, nextId);
    for (const sp of spawned) {
      expect(sp.fromR).toBeLessThan(0);
      expect(sp.toR).toBeGreaterThanOrEqual(0);
      expect(sp.toR).toBeLessThan(8);
    }
  });

  it('only fills empty cells, preserves existing gems', () => {
    const g = emptyGrid();
    put(g, 0, 0, 7); // unique sentinel
    const spawned = refillEmpty(g, 4, nextId);
    expect(spawned.length).toBe(63);
    expect(g[0]![0]?.type).toBe(7);
  });
});

describe('move detection', () => {
  it('findAnyValidMove returns a pair that would match', () => {
    const g = emptyGrid();
    background(g);
    // Plant a known matchable pair: (0,0) and (1,0) are both type 7.
    // (0,0) above (1,0) (1,0), and (0,1) is something else. We want a swap
    // that would create a match. Easiest: build a board that has 2-in-a-row
    // plus a 3rd adjacent gem to swap in.
    // Set (7,0)=7, (7,1)=7, (6,1)=8 (not 7). Then swap (6,1) and (7,1):
    // row 7 becomes 7,7,8 → no 3-run. Instead:
    // Use a "find by inspection" approach: (7,0)=7, (7,1)=7, and place (6,0)=7
    // which is also a 3-vertical at column 0. findAnyValidMove should find
    // some move.
    put(g, 0, 0, 7);
    put(g, 1, 0, 7);
    put(g, 2, 0, 7);
    const move = findAnyValidMove(g);
    expect(move).not.toBeNull();
    if (move) {
      const [a, b] = move;
      expect(wouldMatch(g, a.r, a.c, b.r, b.c)).toBe(true);
    }
  });

  it('wouldMatch is symmetric (restores the grid)', () => {
    const g = emptyGrid();
    background(g);
    // (0,0) and (0,1) are different types from the background pattern; their
    // swap cannot form a 3-in-a-row in the rest of the row.
    const before = g.map((row) => row.map((c) => c?.type));
    expect(wouldMatch(g, 0, 0, 0, 1)).toBe(false);
    const after = g.map((row) => row.map((c) => c?.type));
    expect(after).toEqual(before);
  });

  it('wouldMatch detects a swap that creates a match', () => {
    const g = emptyGrid();
    background(g);
    // Set up: (0,0)=A, (0,1)=X, (0,2)=A, (1,1)=A
    // Swapping (0,1) and (1,1) places an A at (0,1), completing a 3-in-a-row.
    put(g, 0, 0, 7);
    put(g, 0, 1, 7);
    // (0,1) is the background type — we need a NON-7 here. Background gives
    // ((0*3 + 1) % 6) + 1 = 2, so overwrite with a different non-7 type.
    put(g, 0, 1, 8);
    put(g, 0, 2, 7);
    put(g, 1, 1, 7);
    expect(wouldMatch(g, 0, 1, 1, 1)).toBe(true);
    // Grid should be restored.
    expect(g[0]![1]?.type).toBe(8);
    expect(g[1]![1]?.type).toBe(7);
  });
});

describe('detectBombTrigger', () => {
  it('detects bomb + non-bomb → target is the non-bomb', () => {
    const bomb = mkGem(0, 'bomb');
    const target = mkGem(2);
    expect(detectBombTrigger(bomb, target)).toEqual({ bomb, target, double: false });
    expect(detectBombTrigger(target, bomb)).toEqual({ bomb, target, double: false });
  });

  it('detects double-bomb', () => {
    const a = mkGem(0, 'bomb');
    const b = mkGem(1, 'bomb');
    const t = detectBombTrigger(a, b);
    expect(t?.double).toBe(true);
    expect(t?.target).toBeNull();
  });

  it('returns null for two non-bombs', () => {
    expect(detectBombTrigger(mkGem(0), mkGem(1))).toBeNull();
  });
});

describe('findGemPos', () => {
  it('returns the position of a gem by id', () => {
    const g = emptyGrid();
    const a = mkGem(0);
    g[2]![3] = a;
    expect(findGemPos(g, a.id)).toEqual({ r: 2, c: 3 });
  });

  it('returns null when the id is not present', () => {
    expect(findGemPos(emptyGrid(), 9999)).toBeNull();
  });
});

describe('Position', () => {
  it('is a readonly shape', () => {
    const p: Position = { r: 1, c: 2 };
    expect(p.r).toBe(1);
    expect(p.c).toBe(2);
  });
});
