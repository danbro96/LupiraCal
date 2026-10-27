import { useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import type { ItemColor } from '@lupira/cal-api/models';
import { ITEM_COLORS } from '../theme/kinds';
import { ColorSwatches } from './ColorSwatches';

/** An item's colour as one dot beside its title; the swatches open from it. */
export function ColorDot({ value, calendarFill, onChange, disabled }: {
  value: ItemColor | null;
  calendarFill: string;
  onChange: (color: ItemColor | null) => void;
  disabled?: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title={value ?? 'Calendar colour'}>
        <span>
          <ButtonBase
            aria-label="Colour"
            aria-haspopup="dialog"
            disabled={disabled}
            onClick={(e) => setAnchor(e.currentTarget)}
            sx={{ width: 20, height: 20, borderRadius: '999px', border: 1, borderColor: 'divider', '&.Mui-disabled': { opacity: 0.5 } }}
            style={{ background: value ? ITEM_COLORS[value] : calendarFill }}
          />
        </span>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, maxWidth: 296 }}>
          <ColorSwatches
            value={value}
            calendarFill={calendarFill}
            onChange={(color) => {
              onChange(color);
              setAnchor(null);
            }}
          />
        </Box>
      </Popover>
    </>
  );
}
