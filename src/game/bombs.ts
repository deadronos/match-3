/**
 * Bomb handling. A bomb swap clears every gem of the swapped-into color,
 * or — when two bombs are swapped — clears the whole board for a big bonus.
 */
import { sleep } from './animation';
import { ANIM, GRID, SCORING } from './config';
import type { GameState, Gem } from './types';

/** What kind of bomb swap just happened. */
export interface BombTrigger {
  bomb: Gem;
  target: Gem | null;
  double: boolean;
}

/**
 * Apply a bomb swap.
 *
 *  1. Decide which cells are affected (target color, or all for double).
 *  2. Add the score bonus and show a big "score pop" at the board center.
 *  3. Wait for the pop animation, then null out the affected cells.
 *  4. Let gravity + refill run via `runGravityAndRefill`.
 *
 * `setState`, `mutateGrid`, and `runGravityAndRefill` are passed in by the
 * engine so this module stays free of React / engine state.
 */
export async function resolveBombTrigger(
  trigger: BombTrigger,
  state: GameState,
  setState: (updater: (s: GameState) => GameState) => void,
  mutateGrid: (fn: (grid: (Gem | null)[][]) => void) => void,
  runGravityAndRefill: () => Promise<void>,
): Promise<void> {
  const cells = getBombCells(trigger, state);
  if (cells.length === 0) return;

  const bonus = trigger.double
    ? SCORING.bombFullClearBonus
    : SCORING.bombColorBonus + cells.length * SCORING.bombColorPerGem;

  setState((current) => ({
    ...current,
    score: current.score + bonus,
    poppedGems: new Set(cells.map((gem) => gem.id)),
    lastPop: {
      r: trigger.double ? 3 : Math.floor(GRID / 2),
      c: trigger.double ? 3 : Math.floor(GRID / 2),
      big: true,
      text: `+${bonus.toLocaleString()}`,
    },
  }));

  await sleep(ANIM.pop + 20);
  mutateGrid((grid) => {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = grid[r]?.[c] ?? null;
        if (trigger.double) {
          grid[r]![c] = null;
          continue;
        }
        if (cell && cell.type === trigger.target?.type) grid[r]![c] = null;
      }
    }
  });

  setState((current) => ({ ...current, poppedGems: new Set<number>() }));
  await runGravityAndRefill();
}

/**
 * Pick the gems a bomb will clear.
 *
 *  - Double bomb -> every gem on the board.
 *  - Regular bomb -> every gem matching the `target` color.
 *  - No target -> empty list (defensive).
 */
function getBombCells(trigger: BombTrigger, state: GameState): Gem[] {
  if (trigger.double) {
    const cells: Gem[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const gem = state.grid[r]?.[c] ?? null;
        if (gem) cells.push(gem);
      }
    }
    return cells;
  }

  const target = trigger.target;
  if (!target) return [];

  const cells: Gem[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const gem = state.grid[r]?.[c] ?? null;
      if (gem && gem.type === target.type) cells.push(gem);
    }
  }
  return cells;
}
