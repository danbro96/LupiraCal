import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { PlaceContext } from '@lupira/cal-domain/placeContext';
import { PLACE_SEARCH_PROMPT, type OmniboxRow, type OmniboxSection } from '@lupira/cal-domain/placeOmnibox';
import type { PlaceSelection } from '@lupira/cal-domain/placeSelection';
import { CloseIcon, HomeIcon, PlaceIcon, SearchIcon } from '@danbro96/lupira-web-mui/icons';
import { usePlaceOmnibox } from '../../../state/usePlaceOmnibox';
import { useIsPhone } from '../../hooks/useIsPhone';
import { ICON_BY_NAME } from '../../theme/kinds';
import { PinPlaceDialog } from './PinPlaceDialog';
import { isHomePrediction, reasonsText } from './PredictionChips';

const PinDropIcon = ICON_BY_NAME.pinDrop;

/** Search every way to a place: what's predicted, places you know, addresses as you type, or a pin on the map. */
export function PlaceSearchDialog({ open, context, initialText = '', onClose, onPicked }: {
  open: boolean;
  context: PlaceContext;
  initialText?: string;
  onClose: () => void;
  onPicked: (selection: PlaceSelection) => void;
}) {
  const isPhone = useIsPhone();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isPhone}>
      {open && <Omnibox context={context} initialText={initialText} onClose={onClose} onPicked={onPicked} />}
    </Dialog>
  );
}

function sectionTitle(section: OmniboxSection, context: PlaceContext): string {
  switch (section.kind) {
    case 'forCategory':
      return context.kind === 'event' ? `Suggested · ${context.category}` : 'Suggested';
    case 'predictions':
      return 'Suggested';
    case 'homes':
      return 'Homes';
    case 'saved':
      return 'Saved';
    case 'frequent':
      return 'Frequent';
    case 'yours':
      return 'Your places';
    case 'addresses':
      return 'Addresses';
    case 'pin':
      return 'Map';
  }
}

function splitDisplayName(displayName: string): [string, string] {
  const comma = displayName.indexOf(',');
  return comma < 0 ? [displayName, ''] : [displayName.slice(0, comma), displayName.slice(comma + 1).trim()];
}

function Omnibox({ context, initialText, onClose, onPicked }: {
  context: PlaceContext;
  initialText: string;
  onClose: () => void;
  onPicked: (selection: PlaceSelection) => void;
}) {
  const box = usePlaceOmnibox(context, { initialText, onResolved: onPicked });
  const { state, sections, nameOf } = box;
  const phase = state.phase;
  const pinning = phase.kind === 'pinning' || phase.kind === 'creating';
  const typed = state.text.trim();

  const row = (section: OmniboxSection, r: OmniboxRow, i: number) => {
    const disabled = !!section.disabled || phase.kind === 'resolving';
    switch (r.kind) {
      case 'place': {
        if (!r.label) return null;
        const via = section.kind === 'forCategory' || section.kind === 'predictions' ? 'prediction' : 'search';
        const why = r.reasons ? reasonsText(r.reasons, nameOf) : r.alreadyAPlace ? 'Already one of your places' : r.context;
        const Icon = section.kind === 'homes' || isHomePrediction(r.reasons) ? HomeIcon : PlaceIcon;
        return (
          <ListItemButton key={r.placeId} disabled={disabled} onClick={() => box.pickPlace(r.placeId, r.label, via)}>
            <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
            <ListItemText primary={r.label} secondary={why || null} />
          </ListItemButton>
        );
      }
      case 'address': {
        const [primary, secondary] = splitDisplayName(r.hit.displayName);
        return (
          <ListItemButton key={`${r.hit.osmType ?? ''}${r.hit.osmId ?? i}`} disabled={disabled} onClick={() => box.pickHit(r.hit)}>
            <ListItemIcon><SearchIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary={primary} secondary={secondary || null} />
          </ListItemButton>
        );
      }
      case 'pin':
        return (
          <ListItemButton key="pin" disabled={disabled} onClick={box.openPin}>
            <ListItemIcon><PinDropIcon fontSize="small" /></ListItemIcon>
            <ListItemText
              primary="Pick on map"
              secondary={section.disabled ? 'Needs a connection' : typed ? `Drop a pin for “${typed}”` : 'Drop a pin where it is'}
            />
          </ListItemButton>
        );
    }
  };

  return (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder={PLACE_SEARCH_PROMPT}
          value={state.text}
          onChange={(e) => box.type(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Box sx={{ height: 4 }}>{box.busy && <LinearProgress />}</Box>
      <DialogContent dividers sx={{ p: 0, minHeight: 240 }}>
        {state.error && !pinning && <Alert severity="error" sx={{ m: 2 }}>{state.error}</Alert>}
        {sections.length === 0 && (
          <Typography variant="body2" component="p" sx={{ p: 2, color: 'text.secondary' }}>
            Type a name or an address.
          </Typography>
        )}
        <List dense disablePadding>
          {sections.map((section) => (
            <Box component="li" key={section.kind} sx={{ listStyle: 'none' }}>
              <Box component="ul" sx={{ p: 0 }}>
                <ListSubheader>{sectionTitle(section, context)}</ListSubheader>
                {section.rows.map((r, i) => row(section, r, i))}
              </Box>
            </Box>
          ))}
        </List>
      </DialogContent>
      {pinning && (
        <PinPlaceDialog
          start={phase.start}
          nameRequired={state.pinNameRequired}
          busy={phase.kind === 'creating'}
          error={state.error}
          onCancel={box.cancelPin}
          onConfirm={box.confirmPin}
        />
      )}
    </>
  );
}
