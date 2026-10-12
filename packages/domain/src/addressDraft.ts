/** An address being typed field by field, before it is a place. */
export interface AddressDraft {
  street: string;
  postcode: string;
  locality: string;
  countryCode: string;
}

export interface AddressQuery {
  street: string;
  postcode?: string;
  locality?: string;
  countryCode?: string;
  /** The same address as one line, for the free-text geocoder. */
  q: string;
}

/** Structured address parts as a geocoder hit carries them. */
export interface AddressComponents {
  street?: string | null;
  houseNumber?: string | null;
  postcode?: string | null;
  locality?: string | null;
  countryCode?: string | null;
}

export const EMPTY_ADDRESS_DRAFT: AddressDraft = { street: '', postcode: '', locality: '', countryCode: '' };

/** Null until the street and a postcode or locality are in: a bare street name matches half the country. */
export function addressQuery(draft: AddressDraft): AddressQuery | null {
  const street = draft.street.trim();
  const countryCode = draft.countryCode.trim().toUpperCase();
  const postcode = draft.postcode.trim() ? normalizePostcode(countryCode, draft.postcode) : '';
  const locality = draft.locality.trim();
  if (!street || (!postcode && !locality)) return null;
  return {
    street,
    ...(postcode ? { postcode } : {}),
    ...(locality ? { locality } : {}),
    ...(countryCode ? { countryCode } : {}),
    q: [street, [postcode, locality].filter(Boolean).join(' ')].join(', '),
  };
}

const DIGIT_POSTCODES: Record<string, { digits: number; format: (d: string) => string }> = {
  SE: { digits: 5, format: (d) => `${d.slice(0, 3)} ${d.slice(3)}` },
  NO: { digits: 4, format: (d) => d },
  DK: { digits: 4, format: (d) => d },
  FI: { digits: 5, format: (d) => d },
  EE: { digits: 5, format: (d) => d },
  LV: { digits: 4, format: (d) => `LV-${d}` },
  LT: { digits: 5, format: (d) => `LT-${d}` },
};

/** A postcode in its country's written form ("34130" → "341 30" in Sweden); anything unrecognised is only trimmed. */
export function normalizePostcode(countryCode: string | null | undefined, raw: string): string {
  const cc = (countryCode ?? '').trim().toUpperCase();
  const rule = DIGIT_POSTCODES[cc];
  const trimmed = raw.trim();
  if (!rule) return trimmed;
  const digits = trimmed.toUpperCase().replace(new RegExp(`^${cc}\\s*-?\\s*`), '').replace(/\s+/g, '');
  return /^\d+$/.test(digits) && digits.length === rule.digits ? rule.format(digits) : trimmed;
}

export function draftFromComponents(hit: AddressComponents): AddressDraft {
  const countryCode = (hit.countryCode ?? '').trim().toUpperCase();
  return {
    street: [hit.street?.trim(), hit.houseNumber?.trim()].filter(Boolean).join(' '),
    postcode: hit.postcode ? normalizePostcode(countryCode, hit.postcode) : '',
    locality: hit.locality?.trim() ?? '',
    countryCode,
  };
}

/** "Storgatan 5, Ljungby"; null without a street. */
export function addressPlaceName(components: AddressComponents): string | null {
  const street = [components.street?.trim(), components.houseNumber?.trim()].filter(Boolean).join(' ');
  if (!components.street?.trim()) return null;
  const locality = components.locality?.trim();
  return locality ? `${street}, ${locality}` : street;
}

export type ResidencyRowState = 'empty' | 'drafting' | 'resolved';

export function residencyRowState(row: { placeId?: string | null; draft: AddressDraft }): ResidencyRowState {
  if (row.placeId) return 'resolved';
  const { street, postcode, locality } = row.draft;
  return street.trim() || postcode.trim() || locality.trim() ? 'drafting' : 'empty';
}

export const UNFINISHED_ADDRESS = 'Finish the address you started, or clear it.';

/** A half-typed address would be dropped silently on save, so it blocks the save instead. */
export function residencySaveError(rows: readonly ResidencyRowState[]): string | null {
  return rows.includes('drafting') ? UNFINISHED_ADDRESS : null;
}
