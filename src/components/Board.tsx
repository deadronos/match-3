/**
 * The grid background + every gem currently in play.
 *
 * Pure render: read `state.grid` and project it into absolute-positioned
 * `<Gem>` children. Spawning gems (mid-fall) use the row from
 * `state.spawned` so the CSS transition animates them in from above.
 */
import { type ReactElement, useMemo } from 'react';
import { posKey } from '../game/board';
import { GRID } from '../game/config';
import type { GameState, Position } from '../game/types';
import { Gem } from './Gem';

interface BoardProps {
  /** Current engine state. */
  state: GameState;
  /** Click handler: receives the clicked gem's stable id + the pointer event. */
  onGemPointerDown: (gemId: number, ev: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * Render the playfield.
 *
 *  - Draws the 8x8 cell background tiles.
 *  - Walks `state.grid` and draws a `<Gem>` for every non-null cell.
 *  - Uses the gem's `spawned.fromR` instead of the final row while a gem is
 *    still falling in, so CSS animates the drop.
 *  - Floats the most recent score popup above the board.
 */
export function Board({ state, onGemPointerDown }: BoardProps) {
  const cells = useMemo(() => {
    const out: ReactElement[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        out.push(
          <div
            key={`bg-${r}-${c}`}
            className="cell-bg"
            style={{
              left: `calc(${c} * (100% / ${GRID}))`,
              top: `calc(${r} * (100% / ${GRID}))`,
            }}
          />,
        );
      }
    }
    return out;
  }, []);

  // Build a quick map from spawned gem id -> its "from" row.
  const spawnFromRow = useMemo(() => {
    const m = new Map<number, number>();
    for (const sp of state.spawned) m.set(sp.id, sp.fromR);
    return m;
  }, [state.spawned]);

  const selectedKey = state.selected ? posKey(state.selected) : null;
  const hintKeys = new Set(state.hint?.map(posKey) ?? []);

  const gems: ReactElement[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = state.grid[r]?.[c] ?? null;
      if (!cell) continue;
      const fromR = spawnFromRow.get(cell.id);
      const at: Position = fromR !== undefined ? { r: fromR, c } : { r, c };
      const key = posKey({ r, c });
      gems.push(
        <Gem
          key={cell.id}
          gem={cell}
          at={at}
          selected={selectedKey === key}
          cursor={state.cursor.r === r && state.cursor.c === c}
          hint={hintKeys.has(key)}
          popping={state.poppedGems.has(cell.id)}
          level={state.level}
          onPointerDown={onGemPointerDown}
        />,
      );
    }
  }

  return (
    <div className="board-wrap">
      <div className="board">
        {cells}
        {gems}
        {state.lastPop ? (
          <ScorePop
            key={`pop-${state.lastPop.text}-${state.lastPop.r}-${state.lastPop.c}`}
            {...state.lastPop}
          />
        ) : null}
      </div>
    </div>
  );
}

/** A floating "+123" text that drifts up and fades out. */
function ScorePop({ r, c, big, text }: { r: number; c: number; big: boolean; text: string }) {
  return (
    <div
      className={`score-pop${big ? ' big' : ''}`}
      style={{
        left: `calc(${c} * (100% / ${GRID}) + (100% / ${GRID}) / 2)`,
        top: `calc(${r} * (100% / ${GRID}) + (100% / ${GRID}) / 2)`,
      }}
    >
      {text}
    </div>
  );
}
