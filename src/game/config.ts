import type { LevelConfig } from './types';

/** Grid side length (cells). */
export const GRID = 8;

export interface GemColor {
  readonly name: string;
  readonly bg: string;
  readonly light: string;
  readonly dark: string;
}

export const BASE_COLORS: readonly GemColor[] = [
  { name: 'pink', bg: '#FF6B9D', light: '#FF9BC0', dark: '#E04E7E' },
  { name: 'amber', bg: '#FFC75F', light: '#FFD98C', dark: '#E5A937' },
  { name: 'coral', bg: '#FF8E72', light: '#FFB09A', dark: '#E66B4E' },
  { name: 'green', bg: '#6BCB77', light: '#95E1A3', dark: '#48B055' },
  { name: 'blue', bg: '#4D96FF', light: '#7DB3FF', dark: '#2C75DB' },
  { name: 'purple', bg: '#9B72CF', light: '#B89AE0', dark: '#7853B0' },
] as const;

export const EXTRA_COLORS: readonly GemColor[] = [
  { name: 'teal', bg: '#5EC2B0', light: '#85D6C7', dark: '#3FA08F' },
  { name: 'rose', bg: '#F25C8A', light: '#F78AAA', dark: '#C7396A' },
] as const;

/** localStorage key for the all-time best score. */
export const STORAGE_KEY = 'gems.match3.v1';

/** Animation durations in ms. */
export const ANIM = {
  swap: 280,
  fall: 320,
  pop: 320,
  hintDelay: 5000,
  hintVisible: 3000,
} as const;

/** Scoring tuning. */
export const SCORING = {
  basePerGem: 30,
  bombFullClearBonus: 5000,
  bombColorBonus: 200,
  bombColorPerGem: 50,
  moveRemainingBonus: 50,
  comboStep: 0.5,
  comboMax: 8,
} as const;

/** UI delays used after a pop, before gravity starts. */
export const POP_SETTLE_MS = 20;

/**
 * Pick the palette for a given level. Levels 1-3: 6 colors. 4-6: 7. 7+: 8.
 */
export function colorPalette(level: number): readonly GemColor[] {
  if (level >= 7) return [...BASE_COLORS, ...EXTRA_COLORS];
  if (level >= 4) return [...BASE_COLORS, EXTRA_COLORS[0]!];
  return BASE_COLORS;
}

/** Number of distinct gem colors for a given level. */
export function numTypes(level: number): number {
  return colorPalette(level).length;
}

/** Compute target + moves for a level. Difficulty ramps each level. */
export function levelConfig(level: number): LevelConfig {
  const target = 1000 + (level - 1) * 800;
  const moves = Math.max(18, 30 - Math.floor((level - 1) / 2));
  return { target, moves };
}
