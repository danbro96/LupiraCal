import { describe, expect, it } from 'vitest';
import { needsAddressBookBootstrap, needsCalendarBootstrap } from './bootstrap';

describe('needsCalendarBootstrap', () => {
  it('asks when the caller has no calendars', () => {
    expect(needsCalendarBootstrap([])).toBe(true);
  });

  it('asks when only a shared calendar arrived before the first login', () => {
    expect(needsCalendarBootstrap([{ kind: 'Group' }])).toBe(true);
  });

  it('stays quiet once a Personal calendar exists', () => {
    expect(needsCalendarBootstrap([{ kind: 'Group' }, { kind: 'Personal' }, { kind: null }])).toBe(false);
  });
});

describe('needsAddressBookBootstrap', () => {
  it('asks until your own personal book exists', () => {
    expect(needsAddressBookBootstrap([])).toBe(true);
    expect(needsAddressBookBootstrap([{ isPersonal: false }])).toBe(true);
    expect(needsAddressBookBootstrap([{ isPersonal: false }, { isPersonal: true }])).toBe(false);
  });
});
