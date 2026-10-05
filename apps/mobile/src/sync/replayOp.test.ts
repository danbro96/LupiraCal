import { beforeEach, describe, expect, it, vi } from 'vitest';

const cal = vi.hoisted(() => ({
  inviteParticipant: vi.fn(),
  respondToInvitation: vi.fn(),
}));
vi.mock('@lupira/cal-api/fetch/cal', () => cal);
vi.mock('@lupira/cal-api/fetch/contact', () => ({}));

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
