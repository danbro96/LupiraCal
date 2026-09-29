import { createItem, deleteItem, getItem, inviteParticipant, mergeItemMetadata, removeParticipant, updateItem } from '@lupira/cal-api/fetch/cal';
import { fileItemToCalendar, removeItemFromCalendar } from '@lupira/cal-api/fetch/cal';
import type { UpdateCalendarItemRequest } from '@lupira/cal-api/models';
import { createContact, deleteContact, reviseContact, setContactChannels, setContactProfiles, setContactTags } from '@lupira/cal-api/fetch/contact';
import type { ContactReachChannel } from '@lupira/cal-api/models';
import { ApiError } from '../domain/apiError';
import type { ClientOp, ItemCore } from '../domain/ops';

/** Op → REST. Every call carries `Idempotency-Key: commandId` (the server ledger makes redelivery a no-op —
 *  and it's what licenses the mutator to auto-retry writes) and the op's occurredAt (the server's LWW input). */
export async function replayOp(op: ClientOp): Promise<void> {
  const idem = { headers: { 'Idempotency-Key': op.commandId } };
  switch (op.kind) {
    case 'item.create':
      await createItem({
        sourceKey: op.sourceKey,
        calendarId: op.calendarId,
        title: op.core.title ?? undefined,
        description: op.core.description ?? undefined,
        status: op.core.status ?? undefined,
        category: op.core.category ?? undefined,
        isAllDay: op.core.isAllDay ?? false,
        startsAt: op.core.startsAt ?? undefined,
        endsAt: op.core.endsAt ?? undefined,
        startDate: op.core.startDate ?? undefined,
        endDate: op.core.endDate ?? undefined,
        startTimezone: op.core.startTimezone ?? undefined,
        recurrenceRule: op.core.recurrenceRule ?? undefined,
        tags: op.core.tags ?? undefined,
        parentItemId: op.core.parentItemId ?? undefined,
        availability: (op.core.availability ?? undefined) as never,
        placeId: op.core.placeId ?? undefined,
        location: op.core.placeId ? (op.core.location ?? undefined) : undefined,
      }, idem);
      return;
    case 'item.revise':
      await updateItem(op.itemId, totalizedPut(op.core, op.occurredAt), idem);
      return;
    case 'item.metadata':
      await mergeItemMetadata(op.itemId, op.patch, { occurredAt: op.occurredAt }, idem);
      return;
    case 'item.delete':
      await deleteItem(op.itemId, idem);
      return;
    case 'item.file':
      await fileItemToCalendar(op.itemId, op.calendarId, { status: op.entryStatus, occurredAt: op.occurredAt }, idem);
      return;
    case 'item.unfile':
      await removeItemFromCalendar(op.itemId, op.calendarId, { occurredAt: op.occurredAt }, idem);
      return;
    // Participation endpoints ignore Idempotency-Key; invite is idempotent by contact instead, so a
    // redelivered op re-invites nobody.
    case 'item.invite':
      for (const contactId of op.contactIds) await inviteParticipant(op.itemId, { contactId });
      return;
    case 'item.uninvite':
      await uninvite(op.itemId, op.contactId);
      return;
    case 'contact.create':
      await createContact({
        sourceKey: op.sourceKey,
        addressBookId: op.addressBookId,
        givenName: op.core.givenName ?? undefined,
        middleName: op.core.middleName ?? undefined,
        familyName: op.core.familyName ?? undefined,
        nickname: op.core.nickname ?? undefined,
        kind: (op.core.kind ?? undefined) as never,
        displayNameFormat: (op.core.displayNameFormat ?? undefined) as never,
        channels: (op.core.channels ?? undefined) as ContactReachChannel[] | undefined,
        birthday: op.core.birthday ?? undefined,
        tags: op.core.tags ?? undefined,
        notes: op.core.notes ?? undefined,
        pronouns: op.core.pronouns ?? undefined,
      }, idem);
      return;
    case 'contact.revise':
      await reviseContact(op.contactId, {
        givenName: op.core.givenName ?? undefined,
        middleName: op.core.middleName ?? undefined,
        familyName: op.core.familyName ?? undefined,
        nickname: op.core.nickname ?? undefined,
        kind: (op.core.kind ?? undefined) as never,
        displayNameFormat: (op.core.displayNameFormat ?? undefined) as never,
        channels: (op.core.channels ?? undefined) as ContactReachChannel[] | undefined,
        birthday: op.core.birthday ?? undefined,
        tags: op.core.tags ?? undefined,
        notes: op.core.notes ?? undefined,
        pronouns: op.core.pronouns ?? undefined,
        occurredAt: op.occurredAt,
      }, idem);
      return;
    case 'contact.channels':
      await setContactChannels(op.contactId, { channels: op.channels as ContactReachChannel[], occurredAt: op.occurredAt }, idem);
      return;
    case 'contact.tags':
      await setContactTags(op.contactId, { tags: op.tags, occurredAt: op.occurredAt }, idem);
      return;
    case 'contact.profiles':
      await setContactProfiles(op.contactId, { profiles: op.profiles, occurredAt: op.occurredAt }, idem);
      return;
    case 'contact.delete':
      await deleteContact(op.contactId, idem);
      return;
  }
}

/** The op names a contact because an invite still in the outbox has no participation id yet. */
async function uninvite(itemId: string, contactId: string): Promise<void> {
  let item;
  try {
    item = await getItem(itemId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return;
    throw e;
  }
  if (item.status !== 200) return;
  const participation = item.data.attendees.find((a) => a.contactId === contactId);
  if (participation) await removeParticipant(itemId, participation.participationId);
}

/** The whole-core write: every sentinel set so the op's desired state lands verbatim (incl. clears of the
 *  sentinel-backed fields); non-sentinel fields keep server semantics (null = keep). */
function totalizedPut(core: ItemCore, occurredAt: string): UpdateCalendarItemRequest {
  return {
    title: core.title ?? undefined,
    description: core.description ?? undefined,
    status: core.status ?? undefined,
    category: core.category ?? undefined,
    tags: core.tags ?? undefined,
    parentItemId: core.parentItemId ?? undefined,
    isAllDay: core.isAllDay,
    startsAt: core.startsAt ?? null,
    startsAtProvided: true,
    endsAt: core.endsAt ?? null,
    endsAtProvided: true,
    startDate: core.startDate ?? null,
    startDateProvided: true,
    endDate: core.endDate ?? null,
    endDateProvided: true,
    startTimezone: core.startTimezone ?? null,
    startTimezoneProvided: true,
    endTimezone: core.endTimezone ?? null,
    endTimezoneProvided: true,
    recurrenceRule: core.recurrenceRule ?? null,
    recurrenceRuleProvided: true,
    ...(core.placeId === undefined ? {} : {
      placeId: core.placeId,
      placeIdProvided: true,
      location: core.location ?? undefined,
    }),
    occurredAt,
  };
}
