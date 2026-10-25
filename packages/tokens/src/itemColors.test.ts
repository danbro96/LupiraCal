import { describe, expect, it } from 'vitest';
import { ITEM_COLORS, itemColor } from './itemColors';

describe('itemColor', () => {
  it('draws an item in its own colour', () => {
    expect(itemColor('Red', '#123456')).toBe(ITEM_COLORS.Red);
  });

  it('falls back to the calendar colour when unset or unknown', () => {
    expect(itemColor(null, '#123456')).toBe('#123456');
    expect(itemColor(undefined, '#123456')).toBe('#123456');
    expect(itemColor('Chartreuse', '#123456')).toBe('#123456');
    expect(itemColor('toString', '#123456')).toBe('#123456');
  });
});
