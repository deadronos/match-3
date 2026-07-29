import { sleep } from './animation';
import { ANIM, GRID, SCORING } from './config';
import type { GameState, Gem } from './types';

export interface BombTrigger {
  bomb: Gem;
  target: Gem | null;
  double: boolean;
}

export async function resolveBombTrigger(
  trigger: BombTrigger,
  state: GameState,
  setState: (updater: (s: GameState) => GameState) => void,
  mutateGrid: (fn: (grid: (Gem | null)[][]) => void) => void,
  runGravityAndRefill: () => Promise<void>,
): Promise<void> {
  if (trigger.double) {
    const cells: Gem[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const gem = state.grid[r]?.[c] ?? null;
        if (gem) cells.push(gem);
      }
    }

    setState((current) => ({
      ...current,
      score: current.score + SCORING.bombFullClearBonus,
      poppedGems: new Set(cells.map((gem) => gem.id)),
      lastPop: {
        r: 3,
        c: 3,
        big: true,
        text: `+${SCORING.bombFullClearBonus.toLocaleString()}`,
      },
    }));

    await sleep(ANIM.pop + 20);
    mutateGrid((grid) => {
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          grid[r]![c] = null;
        }
      }
    });
    setState((current) => ({ ...current, poppedGems: new Set<number>() }));
    await runGravityAndRefill();
    return;
  }

  const target = trigger.target;
  if (!target) return;

  const cells: Gem[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const gem = state.grid[r]?.[c] ?? null;
      if (gem && gem.type === target.type) cells.push(gem);
    }
  }

  const bonus = SCORING.bombColorBonus + cells.length * SCORING.bombColorPerGem;
  setState((current) => ({
    ...current,
    score: current.score + bonus,
    poppedGems: new Set(cells.map((gem) => gem.id)),
    lastPop: {
      r: Math.floor(GRID / 2),
      c: Math.floor(GRID / 2),
      big: true,
      text: `+${bonus.toLocaleString()}`,
    },
  }));

  await sleep(ANIM.pop + 20);
  mutateGrid((grid) => {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cell = grid[r]?.[c] ?? null;
        if (cell && cell.type === target.type) grid[r]![c] = null;
      }
    }
  });
  setState((current) => ({ ...current, poppedGems: new Set<number>() }));
  await runGravityAndRefill();
}
