import { describe, expect, it } from 'vitest';
import { attendeeSummary, participationIdOf, roleLabel, rsvpLabel } from './participation';

describe('participation wording', () => {
  it('labels replies and roles, unknown values verbatim', () => {
    expect(rsvpLabel('Accepted')).toBe('Going');
    expect(rsvpLabel(undefined)).toBe('Invited — no reply yet');
    expect(rsvpLabel('Mystery')).toBe('Mystery');
    expect(roleLabel('Chair')).toBe('Organiser');
  });

  it('counts the replies in a fixed order', () => {
    expect(attendeeSummary([{ status: 'NeedsAction' }, { status: 'Accepted' }, { status: 'Accepted' }, { status: 'Tentative' }]))
      .toBe('4 people · 2 going · 1 maybe · 1 no reply');
    expect(attendeeSummary([])).toBe('0 people');
  });

  it("finds the participation an invite created, not a pending one's blank id", () => {
    const item = { attendees: [{ contactId: 'me', participationId: 'p-1' }, { contactId: 'anna', participationId: '' }] };
    expect(participationIdOf(item, 'me')).toBe('p-1');
    expect(participationIdOf(item, 'anna')).toBeNull();
  });
});
