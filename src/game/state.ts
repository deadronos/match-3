import { emptyGrid } from './board';
import type { GameState } from './types';

export function createInitialState(): GameState {
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
