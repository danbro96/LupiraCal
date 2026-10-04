import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { MAP_ALL_FROM_YMD } from '@lupira/cal-domain/mapWindow';
import { addDays, startOfDay, ymd } from '@lupira/cal-domain/time';
import { ACTIVITY_COLORS, type MapTheme } from '@lupira/cal-tokens/map';
import { LAYERS, LAYER_KEYS, type LayerKey } from '@lupira/cal-tokens/mapLayers';
import { unmappableLine } from '@lupira/cal-domain/mapFeatures';

const PRESETS = [
  { key: 'today', label: 'Today', days: 1 },
  { key: 'yesterday', label: 'Yesterday', days: 1, offset: -1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: 'year', label: 'Year', days: 365 },
  { key: 'all', label: 'All', days: null },
] as const;

export const DEFAULT_PRESET = '30d';

export interface DateRange {
  /** Inclusive local date (YYYY-MM-DD). */
  fromYmd: string;
  toYmd: string;
}

export function presetRange(key: string): DateRange | null {
  const preset = PRESETS.find((p) => p.key === key);
  if (!preset) return null;
  const offset = 'offset' in preset ? preset.offset : 0;
  const end = addDays(startOfDay(new Date()), offset);
  return { fromYmd: preset.days == null ? MAP_ALL_FROM_YMD : ymd(addDays(end, -(preset.days - 1))), toYmd: ymd(end) };
}

/** The preset a range is, if any — what gets remembered between visits. */
export function presetOf(range: DateRange): string | undefined {
  return PRESETS.find((p) => {
    const r = presetRange(p.key);
    return r && r.fromYmd === range.fromYmd && r.toYmd === range.toYmd;
  })?.key;
}

/** Preset chips + custom from/to, URL-param-backed; one range for every dated layer — events, photos,
 *  hotspots and movement. */
export function TimeRangeBar({ range, onChange }: { range: DateRange; onChange: (r: DateRange) => void }) {
  const activeKey = presetOf(range);

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
  const toggles = LAYER_KEYS.map((key) => ({ key, label: LAYERS[key].label }));
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
                  title={unmappableLine(unmappableCount)}
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
