import { describe, expect, it } from 'vitest';
import { BASE_COLORS, EXTRA_COLORS, levelConfig, numTypes } from './config';

describe('colorPalette', () => {
  it('returns 6 base colors for levels 1-3', () => {
    expect(numTypes(1)).toBe(BASE_COLORS.length);
    expect(numTypes(2)).toBe(BASE_COLORS.length);
    expect(numTypes(3)).toBe(BASE_COLORS.length);
  });

  it('returns 7 colors for levels 4-6', () => {
    expect(numTypes(4)).toBe(BASE_COLORS.length + 1);
    expect(numTypes(6)).toBe(BASE_COLORS.length + 1);
  });

  it('returns 8 colors for level 7+', () => {
    expect(numTypes(7)).toBe(BASE_COLORS.length + EXTRA_COLORS.length);
    expect(numTypes(20)).toBe(BASE_COLORS.length + EXTRA_COLORS.length);
  });
});

describe('levelConfig', () => {
  it('level 1: 1000 target, 30 moves', () => {
    expect(levelConfig(1)).toEqual({ target: 1000, moves: 30 });
  });

  it('target increases by 800 each level', () => {
    expect(levelConfig(2).target).toBe(1800);
    expect(levelConfig(5).target).toBe(4200);
  });

  it('moves decrease every two levels, floored at 18', () => {
    expect(levelConfig(1).moves).toBe(30);
    expect(levelConfig(2).moves).toBe(30);
    expect(levelConfig(3).moves).toBe(29);
    expect(levelConfig(13).moves).toBe(24);
    expect(levelConfig(25).moves).toBe(18); // clamped
    expect(levelConfig(100).moves).toBe(18);
  });
});
