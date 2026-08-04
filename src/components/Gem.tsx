/**
 * A single gem tile on the board.
 *
 * Pure visual: takes a {@link Gem} + the visual flags (selected, cursor,
 * hint, popping) and renders an absolutely-positioned tile. Wrapped in
 * `memo` so re-rendering the whole board doesn't re-render unchanged gems.
 */
import { memo, type ReactElement } from 'react';
import { colorPalette, GRID } from '../game/config';
import type { Gem as GemType, Position, Special } from '../game/types';
import { IconBomb, IconStripedH, IconStripedV } from './icons';

interface GemProps {
  gem: GemType;
  /** Where to render the gem (r, c are 0..7). */
  at: Position;
  /** True if this gem is the currently selected one. */
  selected: boolean;
  /** True if the keyboard cursor is on this cell. */
  cursor: boolean;
  /** True if this gem is part of the current "hint" pair. */
  hint: boolean;
  /** True if this gem is mid-pop animation. */
  popping: boolean;
  /** Current level — used to pick the right color palette. */
  level: number;
  /** Pointer-down handler; receives the gem id. */
  onPointerDown?: (gemId: number, ev: React.PointerEvent<HTMLDivElement>) => void;
}

/** Render the small badge icon for a special piece. */
function specialBadge(s: Special): ReactElement | null {
  if (s === 'striped-h') return <IconStripedH />;
  if (s === 'striped-v') return <IconStripedV />;
  if (s === 'bomb') return <IconBomb />;
  return null;
}

/**
 * Internal (un-memoized) Gem view. {@link Gem} is the memoized export.
 *
 * Reads the level's palette to pick this gem's color and exposes the
 * palette colors as CSS variables on the element so the gradient CSS
 * (`.gem .shape`) can use them.
 */
function GemView({ gem, at, selected, cursor, hint, popping, level, onPointerDown }: GemProps) {
  const palette = colorPalette(level);
  const color = palette[gem.type] ?? palette[0]!;
  const left = `calc(${at.c} * (100% / ${GRID}))`;
  const top = `calc(${at.r} * (100% / ${GRID}))`;

  const className = [
    'gem',
    selected && 'selected',
    cursor && 'cursor',
    hint && 'hint',
    popping && 'popping',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      data-id={gem.id}
      data-r={at.r}
      data-c={at.c}
      style={
        {
          left,
          top,
          '--c-bg': color.bg,
          '--c-light': color.light,
          '--c-dark': color.dark,
        } as React.CSSProperties
      }
      onPointerDown={(ev) => onPointerDown?.(gem.id, ev)}
    >
      <div className="shape" />
      {gem.special ? <div className="badge">{specialBadge(gem.special)}</div> : null}
    </div>
  );
}

/** Memoized Gem. Re-renders only when one of its props changes. */
export const Gem = memo(GemView);
