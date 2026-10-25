import { beforeEach, describe, expect, it, vi } from 'vitest';

const cal = vi.hoisted(() => ({
  createItem: vi.fn(),
  updateItem: vi.fn(),
  getItem: vi.fn(),
  inviteParticipant: vi.fn(),
  respondToInvitation: vi.fn(),
  setParticipantReminder: vi.fn(),
  changeOccurrence: vi.fn(),
  restoreOccurrence: vi.fn(),
  changeFollowingOccurrences: vi.fn(),
}));
vi.mock('@lupira/cal-api/fetch/cal', () => cal);
const contact = vi.hoisted(() => ({
  addResidency: vi.fn(),
  moveOutOfResidency: vi.fn(),
  reviseResidency: vi.fn(),
  removeResidency: vi.fn(),
  addContactGroupMember: vi.fn(),
  removeContactGroupMember: vi.fn(),
}));
vi.mock('@lupira/cal-api/fetch/contact', () => contact);

const { ApiError } = await import('@danbro96/lupira-http/apiError');
const { replayOp } = await import('./replayOp');

const invited = (contactId: string) => ({ attendees: [{ contactId, participationId: `p-${contactId}` }] });

describe('unresolved location replay', () => {
  const at = { aggregate: 'cal.item', aggregateId: 'item-1', itemId: 'item-1', occurredAt: '2026-09-30T12:00:00Z', commandId: '0192f0c4-0000-7000-8000-000000000010' } as const;
  const core = { title: 'Picnic', isAllDay: false, startsAt: '2026-10-01T09:00:00Z' };

  beforeEach(() => {
    cal.createItem.mockReset().mockResolvedValue(undefined);
    cal.updateItem.mockReset().mockResolvedValue(undefined);
  });

  it('a create sends the label with the flag and no place', async () => {
    await replayOp({ ...at, kind: 'item.create', sourceKey: 'bridge:u1', calendarId: 'cal-1', core: { ...core, location: 'Kyrkan', locationUnresolved: true } });

    const [body] = cal.createItem.mock.calls[0];
    expect(body).toMatchObject({ location: 'Kyrkan', locationUnresolved: true });
    expect(body.placeId).toBeUndefined();
  });

  it('a revise sends the label or its clear without touching the place sentinel', async () => {
    await replayOp({ ...at, kind: 'item.revise', core: { ...core, location: 'Kyrkan', locationUnresolved: true } });
    await replayOp({ ...at, kind: 'item.revise', core: { ...core, location: null, locationUnresolved: true } });

    const [[, relabel], [, clear]] = cal.updateItem.mock.calls;
    expect(relabel).toMatchObject({ location: 'Kyrkan', locationUnresolved: true });
    expect(clear).toMatchObject({ location: null, locationUnresolved: true });
    expect(relabel).not.toHaveProperty('placeIdProvided');
  });

  it('a placed create sends no flag', async () => {
    await replayOp({ ...at, kind: 'item.create', sourceKey: 'k', calendarId: 'cal-1', core: { ...core, placeId: 'p1', location: 'Park' } });

    const [body] = cal.createItem.mock.calls[0];
    expect(body).toMatchObject({ placeId: 'p1', location: 'Park' });
    expect(body.locationUnresolved).toBeUndefined();
  });
});

describe('colour replay', () => {
  const at = { aggregate: 'cal.item', aggregateId: 'item-1', itemId: 'item-1', occurredAt: '2026-09-30T12:00:00Z', commandId: '0192f0c4-0000-7000-8000-000000000030' } as const;
  const core = { title: 'Picnic', isAllDay: false, startsAt: '2026-10-01T09:00:00Z' };

  beforeEach(() => {
    cal.createItem.mockReset().mockResolvedValue(undefined);
    cal.updateItem.mockReset().mockResolvedValue(undefined);
    cal.changeFollowingOccurrences.mockReset().mockResolvedValue({});
  });

  it('a create sends the colour it has', async () => {
    await replayOp({ ...at, kind: 'item.create', sourceKey: 'k', calendarId: 'cal-1', core: { ...core, color: 'Red' } });
    await replayOp({ ...at, kind: 'item.create', sourceKey: 'k2', calendarId: 'cal-1', core: { ...core, color: null } });

    const [[red], [plain]] = cal.createItem.mock.calls;
    expect(red.color).toBe('Red');
    expect(plain.color).toBeUndefined();
  });

  it('a revise sets or clears the colour under its sentinel, and keeps it when the op has none', async () => {
    await replayOp({ ...at, kind: 'item.revise', core: { ...core, color: 'Red' } });
    await replayOp({ ...at, kind: 'item.revise', core: { ...core, color: null } });
    await replayOp({ ...at, kind: 'item.revise', core });

    const [[, set], [, clear], [, keep]] = cal.updateItem.mock.calls;
    expect(set).toMatchObject({ color: 'Red', colorProvided: true });
    expect(clear).toMatchObject({ color: null, colorProvided: true });
    expect(keep).not.toHaveProperty('color');
    expect(keep).not.toHaveProperty('colorProvided');
  });

  it('a split carries the colour in its changes', async () => {
    await replayOp({ ...at, kind: 'item.split', originalStart: '2026-10-07T09:00:00Z', newItemId: 'item-2', sourceKey: 'k', core: { ...core, color: 'Teal' } });

    const [[, , split]] = cal.changeFollowingOccurrences.mock.calls;
    expect(split.changes).toMatchObject({ color: 'Teal', colorProvided: true });
  });
});

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

describe('occurrence replay', () => {
  const at = { aggregate: 'cal.item', aggregateId: 'item-1', itemId: 'item-1', originalStart: '2026-10-07T17:00:00Z', occurredAt: '2026-09-30T12:00:00Z', commandId: '0192f0c4-0000-7000-8000-000000000020' } as const;
  const key = (options: { headers: Record<string, string> }) => options.headers['Idempotency-Key'];

  beforeEach(() => {
    cal.changeOccurrence.mockReset().mockResolvedValue(undefined);
    cal.restoreOccurrence.mockReset().mockResolvedValue(undefined);
    cal.changeFollowingOccurrences.mockReset().mockResolvedValue({});
    cal.getItem.mockReset();
  });

  it('excludes, changes and restores one occurrence under the command id', async () => {
    await replayOp({ ...at, kind: 'item.occurrence', edit: { kind: 'exclude' } });
    await replayOp({
      ...at, kind: 'item.occurrence',
      edit: { kind: 'change', change: { originalStart: at.originalStart, startsAt: null, endsAt: null, title: 'Match', description: null, status: null, locationLabel: 'x' } },
    });
    await replayOp({ ...at, kind: 'item.occurrence.restore' });

    const [[, start, exclude, options], [, , changed]] = cal.changeOccurrence.mock.calls;
    expect([start, exclude.excluded, key(options)]).toEqual([at.originalStart, true, at.commandId]);
    expect(changed).toEqual({ excluded: false, startsAt: null, endsAt: null, title: 'Match', description: null, status: null, occurredAt: at.occurredAt });
    expect(cal.restoreOccurrence.mock.calls[0].slice(1, 3)).toEqual([at.originalStart, { occurredAt: at.occurredAt }]);
  });

  it('an occurrence of a series that is gone is done, not parked', async () => {
    cal.changeOccurrence.mockRejectedValueOnce(new ApiError(404, 'gone'));
    cal.restoreOccurrence.mockRejectedValueOnce(new ApiError(404, 'gone'));
    await expect(replayOp({ ...at, kind: 'item.occurrence', edit: { kind: 'exclude' } })).resolves.toBeUndefined();
    await expect(replayOp({ ...at, kind: 'item.occurrence.restore' })).resolves.toBeUndefined();

    cal.changeOccurrence.mockRejectedValueOnce(new ApiError(409, 'conflict'));
    await expect(replayOp({ ...at, kind: 'item.occurrence', edit: { kind: 'exclude' } })).rejects.toMatchObject({ status: 409 });
  });

  it('an occurrence the series no longer has is done; any other 400 parks, and so does a split', async () => {
    const notInSeries = () => new ApiError(400, 'not in series', { type: 'https://cal.lupira.com/problems/occurrence-not-in-series' });
    cal.changeOccurrence.mockRejectedValueOnce(notInSeries());
    await expect(replayOp({ ...at, kind: 'item.occurrence', edit: { kind: 'exclude' } })).resolves.toBeUndefined();

    cal.changeOccurrence.mockRejectedValueOnce(new ApiError(400, 'invalid'));
    await expect(replayOp({ ...at, kind: 'item.occurrence', edit: { kind: 'exclude' } })).rejects.toMatchObject({ status: 400 });

    cal.changeFollowingOccurrences.mockRejectedValueOnce(notInSeries());
    await expect(replayOp({ ...at, kind: 'item.split', newItemId: null, sourceKey: null, core: null })).rejects.toMatchObject({ status: 400 });
  });

  it('splits with the whole new series and its source key, or deletes the following occurrences', async () => {
    const core = { title: 'Later', isAllDay: false, startsAt: '2026-10-07T18:00:00Z', recurrenceRule: 'FREQ=WEEKLY;COUNT=2' };
    await replayOp({ ...at, kind: 'item.split', newItemId: 'item-2', sourceKey: 'k', core });
    await replayOp({ ...at, kind: 'item.split', newItemId: null, sourceKey: null, core: null });

    const [[, , split, options], [, , remove]] = cal.changeFollowingOccurrences.mock.calls;
    expect(split).toMatchObject({ excluded: false, sourceKey: 'k', occurredAt: at.occurredAt, changes: { title: 'Later', recurrenceRule: 'FREQ=WEEKLY;COUNT=2', recurrenceRuleProvided: true } });
    expect(key(options)).toBe(at.commandId);
    expect(remove).toMatchObject({ excluded: true, changes: null });
  });

  it('a continuation parks when its split never created the series', async () => {
    cal.getItem.mockRejectedValueOnce(new ApiError(404, 'gone'));
    const continuation = { ...at, kind: 'item.continue', itemId: 'item-2', aggregateId: 'item-2', continuesItemId: 'item-1', state: { doc: { id: 'item-2', isAllDay: false, calendars: [] }, guards: {} } } as const;
    await expect(replayOp(continuation as never)).rejects.toMatchObject({ status: 404 });
  });
});

describe('group membership replay', () => {
  const at = { aggregate: 'contact.group', aggregateId: 'g-1', groupId: 'g-1', contactId: 'c-1', occurredAt: '2026-10-25T12:00:00Z', commandId: '0192f0c4-0000-7000-8000-000000000020' } as const;

  beforeEach(() => {
    contact.addContactGroupMember.mockReset().mockResolvedValue({});
    contact.removeContactGroupMember.mockReset().mockResolvedValue({});
  });

  it('adds and removes the member under the command id', async () => {
    await replayOp({ ...at, kind: 'contact.group.addMember' });
    await replayOp({ ...at, kind: 'contact.group.removeMember' });
    expect(contact.addContactGroupMember).toHaveBeenCalledWith('g-1', { contactId: 'c-1' }, { headers: { 'Idempotency-Key': at.commandId } });
    expect(contact.removeContactGroupMember).toHaveBeenCalledWith('g-1', 'c-1', { headers: { 'Idempotency-Key': at.commandId } });
  });

  it('a remove from a group or of a member already gone is done; an add parks', async () => {
    contact.removeContactGroupMember.mockRejectedValue(new ApiError(404, 'gone'));
    contact.addContactGroupMember.mockRejectedValue(new ApiError(404, 'gone'));
    await expect(replayOp({ ...at, kind: 'contact.group.removeMember' })).resolves.toBeUndefined();
    await expect(replayOp({ ...at, kind: 'contact.group.addMember' })).rejects.toMatchObject({ status: 404 });
  });
});
