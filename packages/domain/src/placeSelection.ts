declare const brand: unique symbol;

export type Brand<B extends string> = { readonly [brand]: B };

export type PlaceSelectionVia = 'prediction' | 'search' | 'geocode' | 'pin' | 'existing';

/** A place a form may store: only built here, so an id always travels with a label and how it was found. */
export type PlaceSelection = {
  readonly placeId: string;
  readonly label: string;
  readonly via: PlaceSelectionVia;
} & Brand<'PlaceSelection'>;

export function selectPlace(placeId: string, label: string, via: PlaceSelectionVia): PlaceSelection {
  if (!placeId.trim()) throw new Error('A place selection needs a place id.');
  if (!label.trim()) throw new Error('A place selection needs a label.');
  return { placeId, label: label.trim(), via } as PlaceSelection;
}

/** The place an existing item already stores; its label may be blank on old rows. */
export function fromStored(placeId: string, label: string | null | undefined): PlaceSelection {
  if (!placeId.trim()) throw new Error('A place selection needs a place id.');
  return { placeId, label: label?.trim() ?? '', via: 'existing' } as PlaceSelection;
}
