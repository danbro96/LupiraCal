// A–Ö letter sections for alphabetical lists. Swedish alphabet: Å/Ä/Ö are letters of their own
// after Z, other diacritics fold to their base letter, anything else files under '#'.

export const INDEX_LETTERS: readonly string[] = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ', '#'];

const OWN_LETTERS = new Set(['Å', 'Ä', 'Ö']);
const collator = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

export function indexLetter(name: string): string {
  const first = name.trim().charAt(0).toLocaleUpperCase('sv');
  if (OWN_LETTERS.has(first)) return first;
  const base = first.normalize('NFD').replace(/\p{M}/gu, '');
  return /^[A-Z]$/.test(base) ? base : '#';
}

export type LetterEntry<T> = { kind: 'header'; letter: string } | { kind: 'item'; item: T };

export interface LetterIndex<T> {
  entries: LetterEntry<T>[];
  /** Entry index of each present letter's header. */
  headerAt: Map<string, number>;
}

/** Sections follow INDEX_LETTERS rather than the collator, so a name the collator files elsewhere
 *  (sv sorts Ü as Y) still lands under the letter its header shows. */
export function indexByLetter<T>(items: readonly T[], nameOf: (item: T) => string): LetterIndex<T> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const letter = indexLetter(nameOf(item));
    const group = groups.get(letter);
    if (group) group.push(item);
    else groups.set(letter, [item]);
  }
  const entries: LetterEntry<T>[] = [];
  const headerAt = new Map<string, number>();
  for (const letter of INDEX_LETTERS) {
    const group = groups.get(letter);
    if (!group) continue;
    headerAt.set(letter, entries.length);
    entries.push({ kind: 'header', letter });
    group.sort((a, b) => collator.compare(nameOf(a), nameOf(b)));
    for (const item of group) entries.push({ kind: 'item', item });
  }
  return { entries, headerAt };
}

/** Scroll offset of each section when headers and rows have fixed heights — lets a list jump in
 *  one scroll instead of measuring its way to an index. */
export function sectionOffsets(
  headerAt: ReadonlyMap<string, number>,
  headerHeight: number,
  rowHeight: number,
): Map<string, number> {
  const offsets = new Map<string, number>();
  let headersBefore = 0;
  for (const [letter, at] of headerAt) {
    offsets.set(letter, headersBefore * headerHeight + (at - headersBefore) * rowHeight);
    headersBefore++;
  }
  return offsets;
}

/** Section to jump to for a rail letter: its own, else the next present one, else the last. */
export function sectionFor<V>(sections: ReadonlyMap<string, V>, letter: string): V | undefined {
  const from = INDEX_LETTERS.indexOf(letter);
  if (from < 0) return undefined;
  for (let i = from; i < INDEX_LETTERS.length; i++) {
    const v = sections.get(INDEX_LETTERS[i]);
    if (v !== undefined) return v;
  }
  for (let i = from - 1; i >= 0; i--) {
    const v = sections.get(INDEX_LETTERS[i]);
    if (v !== undefined) return v;
  }
  return undefined;
}
