# Game Rules

Reference for how the game actually plays. This matches the v1 implementation byte-for-byte. The rewrite preserved all behavior.

## Board

- 8x8 grid.
- 6 colors at levels 1 to 3, 7 at levels 4 to 6, 8 at level 7 and above.
- The grid is always regenerated to have at least one valid move.

## Moves

- 30 moves at level 1, decreasing by 1 every two levels, floored at 18.
- A "move" is a swap that produces a match. Invalid swaps (no match) do not consume a move but do animate the swap-and-undo and shake.
- 0 moves remaining and score below the target equals game over.

## Target

- 1000 at level 1, +800 per level.
- Reaching the target during a turn ends the level at once. Remaining moves convert to a bonus: `moves x 50`.

## Scoring

For each match group cleared, the engine awards:

```
earned = floor(BASE_PER_GEM x clearedCount x combo)
```

| Constant | Value |
| --- | --- |
| `BASE_PER_GEM` | 30 |

The `clearedCount` includes the cells destroyed by triggered specials (striped or bomb expansion) within the same resolution step.

## Combo multiplier

The combo multiplier starts at `1.0` at the beginning of each turn. Each cascade (a new match found after gravity and refill) adds `0.5`, capped at `8.0`. The multiplier shows in the HUD as `x1.5`, `x2`, etc.

## Special pieces

These spawn from the middle cell of a 4-or-more run. The original 4 cells in the run are still cleared, but the middle cell transforms into a special piece and stays in the grid.

### 4-in-a-row -> Striped gem

Clears its full row (`striped-h`) or column (`striped-v`) when it is part of a match.

### 5+ in a row -> Color bomb

- Swap a color bomb with any other gem: all gems of that target's color are cleared, plus the bomb.
- Swap two color bombs: the entire board is cleared.
- Color bomb: `bomb`, 3x3 radius when triggered inside a normal match.

## Cascade / chain

After every match-and-clear, the engine:

1. Pops the cleared cells (320 ms animation).
2. Applies gravity (320 ms). Gems fall to fill gaps.
3. Refills from above (320 ms). New gems spawn off-screen and fall in.
4. Checks for new matches. If any, repeats from step 1 with `combo += 0.5`.

The chain stops when the grid has no matches. Then the engine checks:

- Did the player reach the target? -> Level complete.
- Did the player run out of moves? -> Game over.
- Are there any valid moves left? If not, auto-shuffle the board.

## Hint

After 5 seconds of inactivity (no input, no animation in progress), the engine finds any valid move and pulses the two gems involved for 3 seconds. The hint cancels on the first user input.

## Shuffle

The toolbar shuffle button clears the entire board and regenerates it (with a pop animation, then a fresh gravity and refill). It costs no moves.

## Pause

The game can pause via the P key, the Esc key, or the toolbar pause button. The board freezes mid-animation. The tab also auto-pauses on `visibilitychange` (when the user switches tabs).

## Level progression

Each level uses the same rules but with a higher target and fewer moves. Color count also expands:

| Level | Colors | Target | Moves |
| ---: | ---: | ---: | ---: |
| 1 | 6 | 1000 | 30 |
| 2 | 6 | 1800 | 30 |
| 3 | 6 | 2600 | 29 |
| 4 | 7 | 3400 | 29 |
| 5 | 7 | 4200 | 28 |
| 6 | 7 | 5000 | 28 |
| 7 | 8 | 5800 | 27 |
| 8 | 8 | 6600 | 27 |
| ... | ... | ... | ... |

`moves` is floored at 18 and `target` grows by 800 per level indefinitely.

## High score

The all-time best score is saved to `localStorage` under the key `gems.match3.v1`. It updates on game-over and on level-complete. There is no per-level or per-session high score. Just one number, shared across all runs.

## Edge cases the engine handles

- **No valid moves on board generation**: the engine regenerates (up to 10 retries) until `findAnyValidMove` returns a pair.
- **No valid moves after a turn**: the engine auto-shuffles the board and continues the game.
- **Tab visibility change mid-game**: auto-pause.
- **A swap that produces zero matches**: the swap is animated, then reversed (swap-back animation and shake), and no move is consumed.
- **A swap that produces a single-color bomb + non-bomb interaction**: handled as a bomb activation. The bomb's color is the swap partner's color, and all gems of that color are cleared.
- **Two color bombs swapped**: the entire board is cleared (bonus 5000).
- **A match group of exactly 3**: no special spawned.
- **A match group of exactly 4**: striped spawns at `cells[Math.floor(4/2)] = cells[2]` (the 3rd cell, 0-indexed).
- **A match group of 5+**: bomb spawns at `cells[Math.floor(5/2)] = cells[2]` (the 3rd cell).