import { beforeEach, describe, expect, it, vi } from 'vitest';

const meta = new Map<string, string>();
const fx = vi.hoisted(() => ({
  doc: vi.fn(),
  push: vi.fn(),
  setRsvp: vi.fn(),
  dismiss: vi.fn(),
  toast: vi.fn(),
  me: vi.fn(),
}));
vi.mock('../sync/engine', () => ({ engine: { doc: fx.doc, push: fx.push } }));
vi.mock('../sync/meta', () => ({
  readMeta: async (k: string) => meta.get(k) ?? null,
  writeMeta: async (k: string, v: string) => void meta.set(k, v),
}));
vi.mock('../sync/notifications', () => ({ HANDLED_PREFIX: 'notify.handled.' }));
vi.mock('../data/notifications/port', () => ({ expoNotificationPort: { dismiss: fx.dismiss } }));
vi.mock('./actions', () => ({ setRsvp: fx.setRsvp }));
vi.mock('./useMe', () => ({ loadMyContactId: fx.me }));
vi.mock('@danbro96/lupira-expo-feedback/toast', () => ({ toast: fx.toast }));

const { respondToNotification } = await import('./notificationResponses');

const tap = (action: string, over: { id?: string; date?: number; contactId?: string } = {}) => ({
  id: over.id ?? 'rsvp:party:invited', action, date: over.date ?? 1, data: { url: 'lupiracalendar://item/party', itemId: 'party', contactId: over.contactId ?? 'me' },
});
const party = (attendees: string[]) => ({ doc: { id: 'party', title: 'Party', attendees: attendees.map((contactId) => ({ contactId, status: 'NeedsAction' })) } });

beforeEach(() => {
  meta.clear();
  for (const f of Object.values(fx)) f.mockReset();
  fx.me.mockResolvedValue('me');
  fx.doc.mockResolvedValue(party(['me']));
});

describe('respondToNotification', () => {
  it('answers with the button, takes the prompt down and pushes', async () => {
    expect(await respondToNotification(tap('Tentative'))).toBe('answered');
    expect(fx.setRsvp).toHaveBeenCalledWith('party', 'me', 'Tentative');
    expect(fx.dismiss).toHaveBeenCalledWith('rsvp:party:invited');
    expect(fx.toast).toHaveBeenCalledWith('Maybe · Party');
    expect(fx.push).toHaveBeenCalled();
  });

  it('acts on one tap once, whether the listener or the background task sees it first', async () => {
    await respondToNotification(tap('Accepted'));
    expect(await respondToNotification(tap('Accepted'))).toBe('duplicate');
    expect(fx.setRsvp).toHaveBeenCalledTimes(1);
    expect(await respondToNotification(tap('Accepted', { date: 2 }))).toBe('answered');
  });

  it('only takes down a prompt meant for another account or an event you left', async () => {
    expect(await respondToNotification(tap('Declined', { contactId: 'someone-else' }))).toBe('dropped');
    fx.doc.mockResolvedValue(party(['anna']));
    expect(await respondToNotification(tap('Declined', { date: 2 }))).toBe('dropped');
    fx.doc.mockResolvedValue(null);
    expect(await respondToNotification(tap('Declined', { date: 3 }))).toBe('dropped');
    expect(fx.setRsvp).not.toHaveBeenCalled();
    expect(fx.dismiss).toHaveBeenCalledTimes(3);
  });

  it('ignores body taps and other notifications', async () => {
    expect(await respondToNotification(tap('expo.modules.notifications.actions.DEFAULT'))).toBe('ignored');
    expect(await respondToNotification(tap('Accepted', { id: 'cal:day:2026-10-14' }))).toBe('ignored');
    expect(fx.dismiss).not.toHaveBeenCalled();
  });
});
