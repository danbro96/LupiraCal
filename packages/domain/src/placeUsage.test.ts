import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { foldUsageRows, type PlaceUsage, type PlaceUsageRow } from './placeUsage';

// Expected output is cal-api's PlaceUsageService.Aggregate run over the same rows as single-occurrence items.
const fixture = JSON.parse(
  readFileSync(new URL('../test/fixtures/placeUsage.json', import.meta.url), 'utf8'),
) as { rows: PlaceUsageRow[]; expected: PlaceUsage[]; expectedLimit3: PlaceUsage[] };

describe('foldUsageRows parity with the server fold', () => {
  it('matches the server on the fixture', () => {
    expect(foldUsageRows(fixture.rows)).toEqual(fixture.expected);
  });

  it('applies the limit after ordering', () => {
    expect(foldUsageRows(fixture.rows, 3)).toEqual(fixture.expectedLimit3);
  });

  it('is independent of row order except for same-day labels', () => {
    const reversed = foldUsageRows([...fixture.rows].reverse());
    expect(reversed.map(({ label: _, ...rest }) => rest)).toEqual(fixture.expected.map(({ label: _, ...rest }) => rest));
  });
});

describe('foldUsageRows', () => {
  it('counts an unknown or missing category as General', () => {
    const [usage] = foldUsageRows([
      { placeId: 'p', day: '2025-01-01', category: 'Bogus' },
      { placeId: 'p', day: '2025-01-02' },
    ]);
    expect(usage.byCategory).toEqual([{ category: 'General', eventCount: 2, lastDay: '2025-01-02' }]);
  });

  it('leaves the label null when no row names the place', () => {
    expect(foldUsageRows([{ placeId: 'p', day: '2025-01-01', label: ' ' }])[0].label).toBeNull();
  });
});
