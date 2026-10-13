import { beforeEach, describe, expect, it, vi } from 'vitest';

const cal = vi.hoisted(() => ({
  getItem: vi.fn(),
  inviteParticipant: vi.fn(),
  respondToInvitation: vi.fn(),
  setParticipantReminder: vi.fn(),
}));
vi.mock('@lupira/cal-api/fetch/cal', () => cal);
const contact = vi.hoisted(() => ({
  addResidency: vi.fn(),
  moveOutOfResidency: vi.fn(),
  reviseResidency: vi.fn(),
  removeResidency: vi.fn(),
}));
vi.mock('@lupira/cal-api/fetch/contact', () => contact);

const { ApiError } = await import('@danbro96/lupira-http/apiError');
const { replayOp } = await import('./replayOp');

const invited = (contactId: string) => ({ attendees: [{ contactId, participationId: `p-${contactId}` }] });

describe('item.invite replay', () => {
  beforeEach(() => {
    cal.inviteParticipant.mockReset().mockImplementation(async (_id: string, p: { contactId: string }) => invited(p.contactId));
    cal.respondToInvitation.mockReset().mockResolvedValue(undefined);
  });

  it('accepts on behalf of the listed invitees only, under a key of its own', async () => {
    await replayOp({
      aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.invite', itemId: 'item-1', contactIds: ['me', 'anna'], accept: ['me'],
      occurredAt: '2026-09-30T12:00:00Z', commandId: '0192f0c4-0000-7000-8000-000000000001',
    });

    expect(cal.inviteParticipant).toHaveBeenCalledTimes(2);
    expect(cal.respondToInvitation).toHaveBeenCalledTimes(1);
    const [itemId, participationId, params, options] = cal.respondToInvitation.mock.calls[0];
    expect([itemId, participationId, params.status]).toEqual(['item-1', 'p-me', 'accepted']);
    const inviteKey = cal.inviteParticipant.mock.calls[0][2].headers['Idempotency-Key'];
    expect(options.headers['Idempotency-Key']).not.toBe(inviteKey);
  });

  it('sends no RSVP for a plain invite', async () => {
    await replayOp({
      aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.invite', itemId: 'item-1', contactIds: ['anna'],
      occurredAt: '2026-09-30T12:00:00Z', commandId: '0192f0c4-0000-7000-8000-000000000002',
    });

    expect(cal.respondToInvitation).not.toHaveBeenCalled();
  });
});

describe('item.respond replay', () => {
  const respond = { aggregate: 'cal.item', aggregateId: 'item-1', kind: 'item.respond', itemId: 'item-1', contactId: 'anna', status: 'Tentative', occurredAt: '2026-09-30T12:00:00Z', commandId: '0192f0c4-0000-7000-8000-000000000003' } as const;

  beforeEach(() => {
    cal.getItem.mockReset();
    cal.respondToInvitation.mockReset().mockResolvedValue(undefined);
  });

  it('answers the participation the server holds for the contact', async () => {
    cal.getItem.mockResolvedValue(invited('anna'));
    await replayOp(respond);

    const [itemId, participationId, params, options] = cal.respondToInvitation.mock.calls[0];
    expect([itemId, participationId, params.status]).toEqual(['item-1', 'p-anna', 'Tentative']);
    expect(options.headers['Idempotency-Key']).toBe(respond.commandId);
  });

  it('has nothing to answer once the contact or the item is gone', async () => {
    cal.getItem.mockResolvedValueOnce(invited('bo')).mockRejectedValueOnce(new ApiError(404, 'gone'));
    await replayOp(respond);
    await replayOp(respond);

    expect(cal.respondToInvitation).not.toHaveBeenCalled();
  });
});

describe('item.reminder replay', () => {
  const at = { aggregate: 'cal.item', aggregateId: 'item-1', itemId: 'item-1', contactId: 'anna', occurredAt: '2026-09-30T12:00:00Z', commandId: '0192f0c4-0000-7000-8000-000000000004' } as const;

  beforeEach(() => {
    cal.getItem.mockReset();
    cal.setParticipantReminder.mockReset().mockResolvedValue({});
  });

  it('sets the reminder on the contact\'s participation, minutes only for Before', async () => {
    cal.getItem.mockResolvedValue(invited('anna'));
    await replayOp({ ...at, kind: 'item.reminder', reminder: { mode: 'Before', minutesBefore: 30 } });
    await replayOp({ ...at, kind: 'item.reminder', reminder: { mode: 'Off', minutesBefore: null } });

    const [[itemId, participationId, before, options], [, , off]] = cal.setParticipantReminder.mock.calls;
    expect([itemId, participationId, before]).toEqual(['item-1', 'p-anna', { mode: 'Before', minutesBefore: 30, occurredAt: at.occurredAt }]);
    expect(options.headers['Idempotency-Key']).toBe(at.commandId);
    expect(off).toEqual({ mode: 'Off', occurredAt: at.occurredAt });
  });

  it('does nothing once the contact or the item is gone', async () => {
    cal.getItem.mockResolvedValueOnce(invited('bo')).mockRejectedValueOnce(new ApiError(404, 'gone'));
    await replayOp({ ...at, kind: 'item.reminder', reminder: { mode: 'Off', minutesBefore: null } });
    await replayOp({ ...at, kind: 'item.reminder', reminder: { mode: 'Off', minutesBefore: null } });

    expect(cal.setParticipantReminder).not.toHaveBeenCalled();
  });
});

describe('residency replay', () => {
  const at = {
    aggregate: 'contact.residency', aggregateId: 'r-1', residencyId: 'r-1', contactId: 'c-1',
    occurredAt: '2026-10-12T12:00:00Z', commandId: '0192f0c4-0000-7000-8000-000000000010',
  } as const;
  const home = { placeId: 'p-1', type: 'Home', label: null, movedIn: { year: 2020 }, movedOut: null };

  beforeEach(() => {
    contact.addResidency.mockReset().mockResolvedValue({});
    contact.moveOutOfResidency.mockReset().mockResolvedValue({});
    contact.reviseResidency.mockReset().mockResolvedValue({});
    contact.removeResidency.mockReset().mockResolvedValue(undefined);
  });

  it('starts under the op source key, so a redelivery names the same residency', async () => {
    await replayOp({ ...at, kind: 'contact.residency.start', sourceKey: 'k-1', residency: home });
    const [contactId, body, options] = contact.addResidency.mock.calls[0];
    expect([contactId, body.sourceKey, body.placeId, options.headers['Idempotency-Key']]).toEqual(['c-1', 'k-1', 'p-1', at.commandId]);
  });

  it('moves out under the op command id, not as a correction', async () => {
    await replayOp({ ...at, kind: 'contact.residency.moveOut', movedOut: { year: 2026, month: 10 } });
    const [residencyId, body, options] = contact.moveOutOfResidency.mock.calls[0];
    expect([residencyId, body, options.headers['Idempotency-Key']]).toEqual(['r-1', { movedOut: { year: 2026, month: 10 } }, at.commandId]);
    expect(contact.reviseResidency).not.toHaveBeenCalled();
  });

  it('treats a residency already gone as removed', async () => {
    contact.removeResidency.mockRejectedValue(new ApiError(404, 'gone'));
    await expect(replayOp({ ...at, kind: 'contact.residency.remove' })).resolves.toBeUndefined();
  });
});
