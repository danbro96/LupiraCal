import { describe, expect, it } from 'vitest';
import { pinNameRequired } from './placeContext';

describe('pinNameRequired', () => {
  it('requires a name for an event pin only', () => {
    expect(pinNameRequired({ kind: 'event', category: 'Meal', attendeeIds: [], day: '2026-10-12' })).toBe(true);
    expect(pinNameRequired({ kind: 'residency', contactId: 'c1', householdContactIds: [] })).toBe(false);
    expect(pinNameRequired({ kind: 'free' })).toBe(false);
  });
});
