import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import type { ItemColor } from '@lupira/cal-api/models';
import { textOn } from '@danbro96/lupira-tokens-core/contrast';
import { CheckIcon } from '@danbro96/lupira-web-mui/icons';
import { ITEM_COLORS } from '../theme/kinds';
import { WrapRow } from './WrapRow';

const SWATCHES = Object.entries(ITEM_COLORS) as [ItemColor, string][];

/** An item's colour; null draws it in its calendar's. */
export function ColorSwatches({ value, calendarFill, onChange }: {
  value: ItemColor | null;
  calendarFill: string;
  onChange: (color: ItemColor | null) => void;
}) {
  return (
    <WrapRow role="radiogroup" aria-label="Colour">
      <Chip
        variant={value ? 'outlined' : 'filled'}
        role="radio"
        aria-checked={!value}
        label="Calendar"
        icon={<Box component="span" sx={{ width: 12, height: 12, borderRadius: '999px', flex: 'none' }} style={{ background: calendarFill }} />}
        onClick={() => onChange(null)}
      />
      {SWATCHES.map(([name, fill]) => (
        <Tooltip key={name} title={name}>
          <ButtonBase
            role="radio"
            aria-checked={value === name}
            aria-label={name}
            onClick={() => onChange(name)}
            sx={{ width: 28, height: 28, borderRadius: '999px', color: textOn(fill) }}
            style={{ background: fill }}
          >
            {value === name && <CheckIcon fontSize="small" />}
          </ButtonBase>
        </Tooltip>
      ))}
    </WrapRow>
  );
}
