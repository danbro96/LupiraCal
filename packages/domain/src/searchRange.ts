import { addDays, parseYmd, startOfDay } from '@danbro96/lupira-domain-core/time';

export type RangePreset = 'upcoming' | 'past' | 'all' | 'custom';

export const RANGE_PRESETS = ['upcoming', 'past', 'all', 'custom'] as const;

export interface SearchWindow {
  from?: string;
  to?: string;
  desc: boolean;
}

/**
 * API window for a range preset. Bounds are quantized to local midnight so query keys stay
 * stable within a day: 'upcoming' includes all of today, 'past' is newest-first before today.
 * Custom bounds are yyyy-MM-dd local days, end-inclusive. 'all' leans on the API defaults
 * (all-time with a text query, ±1 year without).
 */
export function rangeToWindow(
  preset: RangePreset,
  customFrom: string | null,
  customTo: string | null,
  now: Date,
): SearchWindow {
  const today = startOfDay(now);
  switch (preset) {
    case 'upcoming':
      return { from: today.toISOString(), desc: false };
    case 'past':
      return { to: today.toISOString(), desc: true };
    case 'all':
      return { desc: false };
    case 'custom':
      return {
        from: customFrom ? parseYmd(customFrom).toISOString() : undefined,
        to: customTo ? addDays(parseYmd(customTo), 1).toISOString() : undefined,
        desc: false,
      };
  }
}
