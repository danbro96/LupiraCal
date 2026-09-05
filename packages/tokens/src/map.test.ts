import { describe, expect, it } from 'vitest';
import { ACTIVITY_COLORS, MAP_COLORS, activityColorExpression } from './map';

describe('map palette', () => {
  it('defines the same keys in both themes, so a theme switch never drops a colour', () => {
    expect(Object.keys(ACTIVITY_COLORS.dark).sort()).toEqual(Object.keys(ACTIVITY_COLORS.light).sort());
    expect(Object.keys(MAP_COLORS.dark).sort()).toEqual(Object.keys(MAP_COLORS.light).sort());
  });

  it('routes every named activity through the expression and falls back to Unknown', () => {
    const expr = activityColorExpression('light');
    const named = Object.keys(ACTIVITY_COLORS.light).filter((k) => k !== 'Unknown');
    for (const activity of named) expect(expr).toContain(activity);
    expect(expr.at(-1)).toBe(ACTIVITY_COLORS.light.Unknown);
  });
});
