import { SCORING } from './config';
import type { GameState } from './types';

export function getTurnCompletionState(state: GameState): {
  shouldCompleteLevel: boolean;
  shouldEndGame: boolean;
  bonus: number;
} {
  const bonus = state.moves * SCORING.moveRemainingBonus;
  return {
    shouldCompleteLevel: state.score >= state.target,
    shouldEndGame: state.moves <= 0,
    bonus,
  };
}
