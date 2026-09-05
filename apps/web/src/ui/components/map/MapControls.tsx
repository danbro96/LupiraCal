import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { addDays, startOfDay, ymd } from '@lupira/cal-domain/time';
import { ACTIVITY_COLORS, type MapTheme } from '@lupira/cal-tokens/map';

export type LayerKey = 'events' | 'movement' | 'contacts' | 'saved' | 'photos';
export const DEFAULT_LAYERS: LayerKey[] = ['events', 'movement', 'contacts'];

const PRESETS = [
  { key: 'today', label: 'Today', days: 1 },
  { key: 'yesterday', label: 'Yesterday', days: 1, offset: -1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
] as const;

export interface DateRange {
  /** Inclusive local date (YYYY-MM-DD). */
  fromYmd: string;
  toYmd: string;
}

export function defaultRange(): DateRange {
  const today = ymd(startOfDay(new Date()));
  return { fromYmd: today, toYmd: today };
}

export function presetRange(key: string): DateRange | null {
  const preset = PRESETS.find((p) => p.key === key);
  if (!preset) return null;
  const offset = 'offset' in preset ? preset.offset : 0;
  const end = addDays(startOfDay(new Date()), offset);
  return { fromYmd: ymd(addDays(end, -(preset.days - 1))), toYmd: ymd(end) };
}

/** Preset chips + custom from/to, URL-param-backed; shared by the events and movement layers. */
export function TimeRangeBar({ range, onChange }: { range: DateRange; onChange: (r: DateRange) => void }) {
  const activeKey = PRESETS.find((p) => {
    const r = presetRange(p.key);
    return r && r.fromYmd === range.fromYmd && r.toYmd === range.toYmd;
  })?.key;

  return (
    <Paper elevation={2} sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.5,
        alignItems: 'center',
        borderRadius: '10px',
        p: '4px 8px',
      }}>
      {PRESETS.map((p) => (
        <Chip
          key={p.key}
          label={p.label}
          variant={p.key === activeKey ? 'filled' : 'outlined'}
          color={p.key === activeKey ? 'primary' : 'default'}
          onClick={() => onChange(presetRange(p.key)!)}
        />
      ))}
      <TextField
        type="date" value={range.fromYmd} sx={{ width: '9.5em' }}
        slotProps={{ htmlInput: { max: range.toYmd, 'aria-label': 'From date' } }}
        onChange={(e) => e.target.value && onChange({ ...range, fromYmd: e.target.value })}
      />
      <Box component="span">–</Box>
      <TextField
        type="date" value={range.toYmd} sx={{ width: '9.5em' }}
        slotProps={{ htmlInput: { min: range.fromYmd, 'aria-label': 'To date' } }}
        onChange={(e) => e.target.value && onChange({ ...range, toYmd: e.target.value })}
      />
    </Paper>
  );
}

/** Layer chips gate the queries (enabled:), not just visibility. */
export function LayerToggles({ active, onToggle, theme, unmappableCount, showHistory, onToggleHistory }: {
  active: LayerKey[];
  onToggle: (key: LayerKey) => void;
  theme: MapTheme;
  unmappableCount: number;
  showHistory: boolean;
  onToggleHistory: () => void;
}) {
  const toggles: { key: LayerKey; label: string }[] = [
    { key: 'events', label: 'Events' },
    { key: 'movement', label: 'Movement' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'saved', label: 'Saved' },
    { key: 'photos', label: 'Photos' },
  ];
  const activities = ACTIVITY_COLORS[theme];

  return (
    <Paper elevation={2} sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.5,
        alignItems: 'center',
        borderRadius: '10px',
        p: '4px 8px',
      }}>
      {toggles.map((t) => (
        <Chip
          key={t.key}
          variant={active.includes(t.key) ? 'filled' : 'outlined'}
          color={active.includes(t.key) ? 'primary' : 'default'}
          onClick={() => onToggle(t.key)}
          label={
            <>
              {t.label}
              {t.key === 'events' && unmappableCount > 0 && (
                <Typography
                  variant="caption"
                  component="span"
                  title={`${unmappableCount} occurrences have a free-text location only (no place)`}
                >
                  {' '}·{unmappableCount}
                </Typography>
              )}
            </>
          }
        />
      ))}
      {active.includes('contacts') && (
        <Chip
          label="History"
          variant={showHistory ? 'filled' : 'outlined'}
          color={showHistory ? 'primary' : 'default'}
          title="Show former addresses (residency history)"
          onClick={onToggleHistory}
        />
      )}
      {active.includes('movement') && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ ml: 0.5, color: 'text.secondary', fontSize: 12, alignItems: 'center' }}
        >
          {(['Walk', 'Run', 'Cycle', 'Vehicle'] as const).map((a) => (
            <Stack key={a} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Box
                component="span"
                sx={{ width: 14, height: 3, borderRadius: '2px', display: 'inline-block' }}
                style={{ background: activities[a] }}
              />
              {a}
            </Stack>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
