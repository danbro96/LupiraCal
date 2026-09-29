import { describe, expect, it } from 'vitest';
import { LIGHT } from './color';
import { textOn } from './contrast';
import { BIRTHDAY_COLOR, CALENDAR_FALLBACK_COLORS } from './kinds';

describe('textOn', () => {
  it('keeps white on the palette the grids fill chips with', () => {
    for (const color of [...CALENDAR_FALLBACK_COLORS, BIRTHDAY_COLOR]) expect(textOn(color)).toBe('#ffffff');
  });

  it('switches to dark text on light fills, in every hex form', () => {
    for (const color of ['#fde047', '#FFF', '#fff8', '#fde047cc']) expect(textOn(color)).toBe(LIGHT.text);
  });

  it('falls back to white for colours it cannot parse', () => {
    expect(textOn('rebeccapurple')).toBe('#ffffff');
  });
});
