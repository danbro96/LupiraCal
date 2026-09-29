/** Client-side text matching both apps use: every word of the query must appear in one of the fields.
 *  JS lowercasing folds å/ä/ö; only the mobile SQL search needs its own fold. */

export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesTerms(terms: readonly string[], ...fields: (string | null | undefined)[]): boolean {
  if (terms.length === 0) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return terms.every((t) => hay.includes(t));
}
