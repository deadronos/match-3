/**
 * Inline SVG icons used by the HUD buttons and the gem "special" badges.
 * Kept tiny and tree-shakeable — no external icon library.
 */
import type { JSX } from 'react';

export function IconShuffle(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="m15 15 6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}

export function IconPause(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x={6} y={5} width={4} height={14} rx={1} />
      <rect x={14} y={5} width={4} height={14} rx={1} />
    </svg>
  );
}

export function IconPlay(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 5v14l12-7z" />
    </svg>
  );
}

export function IconStripedH(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
    >
      <line x1={3} y1={12} x2={21} y2={12} />
    </svg>
  );
}

export function IconStripedV(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
    >
      <line x1={12} y1={3} x2={12} y2={21} />
    </svg>
  );
}

export function IconBomb(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx={12} cy={13} r={7} />
      <path
        d="M14 4l2 2 2-2"
        stroke="currentColor"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
