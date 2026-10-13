import { EMPTY_ADDRESS_DRAFT, normalizePostcode, residencyRowState, residencySaveError, type AddressDraft } from '@lupira/cal-domain/addressDraft';
import type { AddressHint } from './bridgeTranslate';
import type { FuzzyDateDto, ResidencyDoc } from './docTypes';
import type { ResidencyFields } from './ops';

/** One address in the contact editor: a stored residency being edited, or a new one being typed. */
export type AddressRow = {
  key: string;
  stored: ResidencyDoc | null;
  placeId: string | null;
  /** The place's name as picked; blank for a stored place until its lookup lands. */
  label: string;
  type: string;
  draft: AddressDraft;
  movedOut: FuzzyDateDto | null;
  removed: boolean;
  /** The phone-typed address this row was started from; resolving it settles the hint. */
  hintId?: string;
};

export type ResidencyChange =
  | { kind: 'start'; residency: ResidencyFields }
  | { kind: 'revise'; residencyId: string; residency: ResidencyFields }
  | { kind: 'moveOut'; residencyId: string; movedOut: FuzzyDateDto }
  | { kind: 'remove'; residencyId: string };

export function addressRowsFrom(residencies: readonly ResidencyDoc[]): AddressRow[] {
  return residencies.map((r) => ({
    key: r.id, stored: r, placeId: r.placeId, label: '', type: r.type ?? 'Home', draft: EMPTY_ADDRESS_DRAFT, movedOut: r.movedOut ?? null, removed: false,
  }));
}

export function newAddressRow(key: string): AddressRow {
  return { key, stored: null, placeId: null, label: '', type: 'Home', draft: EMPTY_ADDRESS_DRAFT, movedOut: null, removed: false };
}

/** A hint opens as a new row typed from it, even one standing in for a stored address: whether that one was a typo
 *  or a move (Remove vs Moved out) is the user's call. */
export function hintAddressRow(hint: AddressHint, key: string): AddressRow {
  return { ...newAddressRow(key), type: hint.type ?? 'Home', draft: draftFromHint(hint), hintId: hint.id };
}

/** Hints whose row was saved; a removed row leaves its hint standing. */
export function settledHintIds(rows: readonly AddressRow[]): string[] {
  return rows.flatMap((r) => (r.hintId && !r.removed && r.placeId ? [r.hintId] : []));
}

function draftFromHint(hint: AddressHint): AddressDraft {
  const country = hint.country?.trim() ?? '';
  const countryCode = /^[a-z]{2}$/i.test(country) ? country.toUpperCase() : '';
  if (!hint.street && !hint.postcode && !hint.city) {
    const [street, ...rest] = hint.text.split(/\s*[,\n]\s*/);
    return { ...EMPTY_ADDRESS_DRAFT, street: street ?? '', locality: rest.join(' '), countryCode };
  }
  return {
    street: hint.street ?? '',
    postcode: hint.postcode ? normalizePostcode(countryCode, hint.postcode) : '',
    locality: hint.city ?? '',
    countryCode,
  };
}

export function addressSaveError(rows: readonly AddressRow[]): string | null {
  return residencySaveError(rows.filter((r) => !r.removed).map(residencyRowState));
}

const sameDate = (a: FuzzyDateDto | null | undefined, b: FuzzyDateDto | null | undefined) =>
  (a?.year ?? null) === (b?.year ?? null) && (a?.month ?? null) === (b?.month ?? null) && (a?.day ?? null) === (b?.day ?? null);

/** What saving the rows asks of contact-api: a new resolved row starts a residency, a removed stored one is erased,
 *  a stored one whose only change is its end date moves out, any other change corrects it wholesale. */
export function residencyChanges(rows: readonly AddressRow[]): ResidencyChange[] {
  const changes: ResidencyChange[] = [];
  for (const row of rows) {
    const { stored } = row;
    if (!stored) {
      if (!row.removed && row.placeId) {
        changes.push({ kind: 'start', residency: { placeId: row.placeId, type: row.type, label: null, movedIn: null, movedOut: row.movedOut } });
      }
      continue;
    }
    if (row.removed) {
      changes.push({ kind: 'remove', residencyId: stored.id });
      continue;
    }
    const before: ResidencyFields = {
      placeId: stored.placeId, type: stored.type ?? 'Home', label: stored.label ?? null, movedIn: stored.movedIn ?? null, movedOut: stored.movedOut ?? null,
    };
    const after: ResidencyFields = { ...before, placeId: row.placeId ?? stored.placeId, type: row.type, movedOut: row.movedOut };
    const moved = !sameDate(before.movedOut, after.movedOut);
    const revised = before.placeId !== after.placeId || before.type !== after.type;
    if (moved && !revised && after.movedOut) changes.push({ kind: 'moveOut', residencyId: stored.id, movedOut: after.movedOut });
    else if (moved || revised) changes.push({ kind: 'revise', residencyId: stored.id, residency: after });
  }
  return changes;
}
