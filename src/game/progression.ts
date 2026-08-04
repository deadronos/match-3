/**
 * Pure functions for "did the player win / lose this turn?".
 */
import { SCORING } from './config';
import type { GameState } from './types';

/** What the engine should do at the end of the current turn. */
export interface TurnCompletion {
  shouldCompleteLevel: boolean;
  shouldEndGame: boolean;
  bonus: number;
}

/**
 * Inspect the current state and decide whether the level is complete, the
 * game is over, and what the leftover-moves bonus should be.
 *
 *  - `shouldCompleteLevel` -> score reached the level's target.
 *  - `shouldEndGame`       -> out of moves (but didn't reach target).
 *  - `bonus`               -> moves left * {@link SCORING.moveRemainingBonus}.
 */
export function getTurnCompletionState(state: GameState): TurnCompletion {
  const bonus = state.moves * SCORING.moveRemainingBonus;
  return {
    shouldCompleteLevel: state.score >= state.target,
    shouldEndGame: state.moves <= 0,
    bonus,
  };
}
