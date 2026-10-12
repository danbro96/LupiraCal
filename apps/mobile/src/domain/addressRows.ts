import { EMPTY_ADDRESS_DRAFT, residencyRowState, residencySaveError, type AddressDraft } from '@lupira/cal-domain/addressDraft';
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
};

export type ResidencyChange =
  | { kind: 'start'; residency: ResidencyFields }
  | { kind: 'revise'; residencyId: string; residency: ResidencyFields }
  | { kind: 'moveOut'; residencyId: string; movedOut: FuzzyDateDto; residency: ResidencyFields }
  | { kind: 'remove'; residencyId: string };

export function addressRowsFrom(residencies: readonly ResidencyDoc[]): AddressRow[] {
  return residencies.map((r) => ({
    key: r.id, stored: r, placeId: r.placeId, label: '', type: r.type ?? 'Home', draft: EMPTY_ADDRESS_DRAFT, movedOut: r.movedOut ?? null, removed: false,
  }));
}

export function newAddressRow(key: string): AddressRow {
  return { key, stored: null, placeId: null, label: '', type: 'Home', draft: EMPTY_ADDRESS_DRAFT, movedOut: null, removed: false };
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
    if (moved && !revised && after.movedOut) changes.push({ kind: 'moveOut', residencyId: stored.id, movedOut: after.movedOut, residency: before });
    else if (moved || revised) changes.push({ kind: 'revise', residencyId: stored.id, residency: after });
  }
  return changes;
}
