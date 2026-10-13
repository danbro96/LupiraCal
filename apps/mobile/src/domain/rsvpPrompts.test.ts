import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFY_PREFS, type NotifyPrefs } from './notificationPrefs';
import type { NotifyContext } from './reminders';
import { inviterOf, parseRsvpKey, rsvpPrompts, rsvpStatusOf, seedAsked, staleRsvpPrompts, type PendingInvite } from './rsvpPrompts';

const ctx = (now: string, prefs: Partial<NotifyPrefs> = {}): NotifyContext => ({ now: new Date(now), zone: 'Europe/Stockholm', prefs: { ...DEFAULT_NOTIFY_PREFS, ...prefs } });
const NOW = '2026-10-13T12:00:00.000Z';

const invite = (itemId: string, over: Partial<PendingInvite> = {}): PendingInvite => ({
  itemId, title: 'Party', itemStatus: 'Confirmed', allDay: false,
  nextStartUtc: '2026-10-17T16:00:00.000Z', nextStartDay: '2026-10-17', invitedAt: '2026-10-13T11:00:00.000Z', inviter: 'Anna', ...over,
});

describe('rsvpPrompts', () => {
  it('asks once when invited, with the organiser, and remembers it', () => {
    const run = rsvpPrompts([invite('i1')], {}, 'me', ctx(NOW));
    expect(run.present).toEqual([{
      id: 'rsvp:i1:invited', fireAt: NOW, channel: 'rsvp', title: 'Anna invited you', body: 'Party · Sat 17 Oct 18:00',
      data: { url: 'lupiracalendar://item/i1', itemId: 'i1', contactId: 'me' }, category: 'rsvp',
    }]);
    expect(run.asked['rsvp:i1:invited']).toBe(NOW);
    expect(rsvpPrompts([invite('i1')], run.asked, 'me', ctx(NOW)).present).toEqual([]);
  });

  it('asks only about invitations from the last 48 hours, at most five a run', () => {
    const old = invite('old', { invitedAt: '2026-10-10T11:00:00.000Z', inviter: null });
    const many = Array.from({ length: 7 }, (_, i) => invite(`n${i}`, { invitedAt: `2026-10-13T0${i}:00:00.000Z` }));
    const run = rsvpPrompts([old, ...many], {}, 'me', ctx(NOW));
    expect(run.present.map((p) => p.id)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4'].map((id) => `rsvp:${id}:invited`));
    expect(rsvpPrompts([old, ...many], run.asked, 'me', ctx(NOW)).present.map((p) => p.id)).toEqual(['rsvp:n5:invited', 'rsvp:n6:invited']);
  });

  it('says "You’re invited" without an organiser, and skips started or cancelled items', () => {
    const run = rsvpPrompts([
      invite('a', { inviter: null }),
      invite('b', { nextStartUtc: '2026-10-13T11:30:00.000Z' }),
      invite('c', { itemStatus: 'Cancelled' }),
    ], {}, 'me', ctx(NOW));
    expect(run.present.map((p) => [p.id, p.title])).toEqual([['rsvp:a:invited', 'You’re invited']]);
  });

  it('seeds instead of asking while invitation prompts are off', () => {
    const off = rsvpPrompts([invite('i1')], {}, 'me', ctx(NOW, { askWhenInvited: false }));
    expect(off.present).toEqual([]);
    expect(rsvpPrompts([invite('i1')], off.asked, 'me', ctx(NOW)).present).toEqual([]);
  });

  it('reminds to reply the lead time before a timed start, and 18:00 the day before an all-day one', () => {
    const run = rsvpPrompts([invite('t'), invite('d', { allDay: true, nextStartUtc: '2026-10-26T00:00:00.000Z', nextStartDay: '2026-10-26' })], {}, 'me', ctx(NOW));
    expect(run.schedule.map((p) => [p.id, p.fireAt, p.title, p.body])).toEqual([
      ['rsvp:t:beforeStart', '2026-10-16T16:00:00.000Z', 'Going to Party?', 'Tomorrow 18:00 · You haven’t replied'],
      ['rsvp:d:beforeStart', '2026-10-25T17:00:00.000Z', 'Going to Party?', 'Tomorrow · All day · You haven’t replied'],
    ]);
    expect(run.asked['rsvp:t:beforeStart']).toBe('2026-10-16T16:00:00.000Z');
  });

  it('asks a series once: a reply reminder already due is not set again for the next occurrence', () => {
    const asked = { 'rsvp:s:beforeStart': '2026-10-12T16:00:00.000Z' };
    const run = rsvpPrompts([invite('s')], asked, 'me', ctx(NOW));
    expect(run.schedule).toEqual([]);
    expect(run.asked['rsvp:s:beforeStart']).toBe('2026-10-12T16:00:00.000Z');
  });

  it('moves a pending reply reminder with its event and drops it when switched off', () => {
    const asked = { 'rsvp:t:beforeStart': '2026-10-15T16:00:00.000Z' };
    expect(rsvpPrompts([invite('t')], asked, 'me', ctx(NOW)).schedule[0].fireAt).toBe('2026-10-16T16:00:00.000Z');
    const off = rsvpPrompts([invite('t')], asked, 'me', ctx(NOW, { remindToReply: false }));
    expect([off.schedule, off.asked['rsvp:t:beforeStart']]).toEqual([[], undefined]);
  });

  it('forgets prompts for invitations no longer waiting on you', () => {
    const run = rsvpPrompts([], { 'rsvp:gone:invited': NOW, 'rsvp:gone:beforeStart': NOW }, 'me', ctx(NOW));
    expect(run.asked).toEqual({});
  });
});

describe('seedAsked', () => {
  it('marks every waiting invitation as asked without touching earlier entries', () => {
    expect(seedAsked([invite('a'), invite('b')], { 'rsvp:a:invited': 'earlier' }, new Date(NOW))).toEqual({
      'rsvp:a:invited': 'earlier', 'rsvp:b:invited': NOW,
    });
  });
});

describe('staleRsvpPrompts', () => {
  it('names shown prompts whose invitation was answered, cancelled or deleted', () => {
    const stale = staleRsvpPrompts(
      ['rsvp:open:invited', 'rsvp:answered:invited', 'rsvp:cancelled:beforeStart', 'cal:day:2026-10-14'],
      [invite('open'), invite('cancelled', { itemStatus: 'Cancelled' })],
    );
    expect(stale).toEqual(['rsvp:answered:invited', 'rsvp:cancelled:beforeStart']);
  });
});

describe('helpers', () => {
  it('maps action buttons to RSVPs and parses prompt ids', () => {
    expect([rsvpStatusOf('Accepted'), rsvpStatusOf('Declined'), rsvpStatusOf('expo.modules.notifications.actions.DEFAULT')]).toEqual(['Accepted', 'Declined', null]);
    expect(parseRsvpKey('rsvp:i1:beforeStart')).toEqual({ itemId: 'i1', kind: 'beforeStart' });
    expect(parseRsvpKey('cal:day:2026-10-14')).toBeNull();
  });

  it('takes the organiser as inviter unless it is you', () => {
    const a = (contactId: string, role: string) => ({ participationId: '', contactId, role, status: 'NeedsAction' });
    expect(inviterOf([a('me', 'RequiredParticipant'), a('anna', 'Chair')], 'me')).toBe('anna');
    expect(inviterOf([a('me', 'Chair')], 'me')).toBeNull();
  });
});
