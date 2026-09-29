import { describe, expect, it } from 'vitest';
import { displayTitle, statusBadge, UNTITLED } from './itemLabels';

describe('item labels', () => {
  it('falls back to one untitled label for missing or blank titles', () => {
    expect(displayTitle('Dentist')).toBe('Dentist');
    expect(displayTitle('  ')).toBe(UNTITLED);
    expect(displayTitle(null)).toBe(UNTITLED);
  });

  it('badges every status but Confirmed', () => {
    expect(statusBadge('Confirmed')).toBeNull();
    expect(statusBadge(null)).toBeNull();
    expect(statusBadge('Cancelled')).toBe('cancelled');
    expect(statusBadge('Tentative')).toBe('tentative');
  });
});
