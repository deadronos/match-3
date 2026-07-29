import { sleep } from './animation';
import { applyGravity, refillEmpty, resolveClears } from './board';
import { ANIM, numTypes, SCORING } from './config';
import type { Cell, GameState, Gem, MatchInfo, ScorePop } from './types';

export interface TurnResolutionResult {
  scoreDelta: number;
  pop: ScorePop | null;
  poppedGems: Set<number>;
}

export async function resolveTurnSequence(
  state: GameState,
  match: MatchInfo,
  setState: (updater: (s: GameState) => GameState) => void,
): Promise<TurnResolutionResult> {
  const { toClear, upgradeMap } = resolveClears(match, state.grid);
  const nextIdRef = { current: state.nextId };
  const allocateId = () => {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    return id;
  };

  const earned = Math.floor(SCORING.basePerGem * toClear.size * state.combo);
  const firstGroup = match.groups[0]!;
  const popR = firstGroup.cells[0]?.r ?? 0;
  const popC = Math.round(
    firstGroup.cells.reduce((sum, p) => sum + p.c, 0) / firstGroup.cells.length,
  );
  const big = toClear.size >= 5 || state.combo >= 2;

  const poppedGems: Gem[] = [];
  for (const key of toClear) {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    const gem = state.grid[r]?.[c] ?? null;
    if (gem) poppedGems.push(gem);
  }

  setState((current) => ({
    ...current,
    score: current.score + earned,
    poppedGems: new Set(poppedGems.map((gem) => gem.id)),
    lastPop: { r: popR, c: popC, big, text: `+${earned.toLocaleString()}` },
  }));

  await sleep(ANIM.pop + 20);

  const nextGrid = state.grid.map((row) => row.slice());
  for (const key of toClear) {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    nextGrid[r]![c] = null;
  }
  for (const [key, upgrade] of upgradeMap.entries()) {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    const existing = nextGrid[r]?.[c] ?? null;
    if (existing) {
      nextGrid[r]![c] = { ...existing, special: upgrade.special };
    }
  }

  setState((current) => ({
    ...current,
    grid: nextGrid,
    poppedGems: new Set<number>(),
  }));

  await runGravityAndRefill(state, nextGrid, setState, allocateId, nextIdRef);

  return {
    scoreDelta: earned,
    pop: { r: popR, c: popC, big, text: `+${earned.toLocaleString()}` },
    poppedGems: new Set(poppedGems.map((gem) => gem.id)),
  };
}

async function runGravityAndRefill(
  state: GameState,
  grid: Cell[][],
  setState: (updater: (s: GameState) => GameState) => void,
  allocateId: () => number,
  nextIdRef: { current: number },
): Promise<void> {
  const gravityGrid = grid.map((row) => row.slice());
  const moves = applyGravity(gravityGrid);
  setState((current) => ({ ...current, grid: gravityGrid }));
  if (moves.length > 0) {
    await sleep(ANIM.fall);
  }

  const refillGrid = gravityGrid.map((row) => row.slice());
  const spawned = refillEmpty(refillGrid, numTypes(state.level), allocateId);
  setState((current) => ({
    ...current,
    grid: refillGrid,
    spawned: spawned.map((spawn) => ({
      id: spawn.gem.id,
      fromR: spawn.fromR,
      toR: spawn.toR,
      c: spawn.col,
    })),
    nextId: nextIdRef.current,
  }));

  if (spawned.length > 0) {
    await sleep(ANIM.fall);
    setState((current) => ({ ...current, spawned: [] }));
  }
}

export function createTurnStateSnapshot(
  state: GameState,
): Pick<GameState, 'combo' | 'cascadesThisTurn'> {
  return {
    combo: state.combo,
    cascadesThisTurn: state.cascadesThisTurn,
  };
}
