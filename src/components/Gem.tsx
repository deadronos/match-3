import { memo, type ReactElement } from 'react';
import { colorPalette, GRID } from '../game/config';
import type { Gem as GemType, Position, Special } from '../game/types';
import { IconBomb, IconStripedH, IconStripedV } from './icons';

interface GemProps {
  gem: GemType;
  /** Where to render the gem (r, c are 0..7). */
  at: Position;
  selected: boolean;
  cursor: boolean;
  hint: boolean;
  popping: boolean;
  level: number;
  onPointerDown?: (gemId: number, ev: React.PointerEvent<HTMLDivElement>) => void;
}

function specialBadge(s: Special): ReactElement | null {
  if (s === 'striped-h') return <IconStripedH />;
  if (s === 'striped-v') return <IconStripedV />;
  if (s === 'bomb') return <IconBomb />;
  return null;
}

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

export const Gem = memo(GemView);
