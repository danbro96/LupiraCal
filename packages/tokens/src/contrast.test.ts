import { describe, expect, it } from 'vitest';
import { LIGHT } from './color';
import { textOn } from './contrast';
import { AVATAR_COLORS, KIND_COLORS } from './kinds';

describe('textOn', () => {
  it('keeps white on the palettes chips and avatars are filled with', () => {
    for (const color of [...Object.values(KIND_COLORS), ...AVATAR_COLORS]) expect(textOn(color)).toBe('#ffffff');
  });

  it('switches to dark text on light fills, in every hex form', () => {
    for (const color of ['#fde047', '#FFF', '#fff8', '#fde047cc']) expect(textOn(color)).toBe(LIGHT.text);
  });

  it('falls back to white for colours it cannot parse', () => {
    expect(textOn('rebeccapurple')).toBe('#ffffff');
  });
});
