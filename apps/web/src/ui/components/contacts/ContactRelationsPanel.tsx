import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import MuiLink from '@mui/material/Link';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import type { Theme } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import RestoreIcon from '@mui/icons-material/Restore';
import { Link, useLocation } from 'react-router-dom';
import {
  useAddContactRelation,
  useEndContactRelation,
  useListContactRelations,
  useRemoveContactRelation,
  useSearchContacts,
} from '@lupira/cal-api/query/contact';
import type { ContactDto, ContactRelationEntryDto, ContactRelationKind } from '@lupira/cal-api/models';
import { groupRelationEntries, RELATION_KINDS } from '@lupira/cal-domain/contactRelations';
import { matchesTerms, searchTerms } from '@danbro96/lupira-domain-core/textSearch';
import type { RelationCategory, RelationKind } from '@lupira/cal-domain/contactRelations';
import { useInvalidateContacts } from '../../../state/useInvalidate';
import { errText } from '../../errText';
import { useSnackbar } from '@danbro96/lupira-web-mui/SnackbarHost';
import { ContactRelationGraph } from './ContactRelationGraph';
import { WrapRow } from '../WrapRow';
import { DrawerSection } from '../DrawerSection';

const DOT_SX = { width: 8, height: 8, borderRadius: '999px', flex: 'none', display: 'inline-block' } as const;

/** The relation categories carry a domain accent with no MUI palette slot. */
const catAccent = (c: string) => `var(--cat-${c.toLowerCase()})`;

/** Sections with more rows than this start collapsed. */
const OPEN_THRESHOLD = 8;

/** Relations network for a contact: interactive graph + an editable list, sharing category-chip and
 *  search filters plus a selection. Every stored relationship is editable from either of its contacts.
 *  A toggle reveals kin the contact API infers from the parent/child graph (grandparents, cousins, …),
 *  read-only. */
export function ContactRelationsPanel({ contact }: { contact: ContactDto }) {
  const location = useLocation();
  const invalidate = useInvalidateContacts();
  const [showExtended, setShowExtended] = useState(false);
  const { data: relations } = useListContactRelations(contact.id, { includeInferred: showExtended });
  // Relations may point into any book you can read.
  const { data: candidates } = useSearchContacts({});
  const showSnack = useSnackbar();
  const onError = (e: unknown) => showSnack(errText(e) ?? 'Request failed.');
  const add = useAddContactRelation({ mutation: { onSuccess: invalidate, onError } });
  const end = useEndContactRelation({ mutation: { onSuccess: invalidate, onError } });
  const remove = useRemoveContactRelation({ mutation: { onSuccess: invalidate, onError } });

  const [activeCats, setActiveCats] = useState<ReadonlySet<RelationCategory>>(new Set());
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Partial<Record<RelationCategory, boolean>>>({});

  const [toContactId, setToContactId] = useState('');
  const [kind, setKind] = useState<RelationKind>('Friend');
  const [label, setLabel] = useState('');

  const groups = useMemo(() => groupRelationEntries(relations ?? []), [relations]);
  const relatedIds = new Set((relations ?? []).filter((r) => r.provenance !== 'Inferred').map((r) => r.contactId));
  const pickable = (candidates ?? []).filter((c) => c.id !== contact.id && !relatedIds.has(c.id));

  const terms = searchTerms(query);
  const q = terms.length > 0;
  const matches = (r: ContactRelationEntryDto) => matchesTerms(terms, r.displayName, r.label, r.kind);

  const toggleCat = (c: RelationCategory) =>
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const link = (id: string) => ({ pathname: `/contacts/${id}`, search: location.search });
  const rowSelect = (id: string) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button')) return; // links/actions keep their meaning
    setSelectedId((cur) => (cur === id ? null : id));
  };
  // Spread order matters the way the stylesheet's rule order used to: 'selected' lands last so its
  // background wins over the inferred/ended fades.
  const rowSx = (r: ContactRelationEntryDto, kind?: 'inferred' | 'ended') => ({
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    py: '6px',
    borderBottom: 1,
    borderColor: 'divider',
    ...(kind === 'inferred' && { opacity: 0.75, fontStyle: 'italic' }),
    ...(kind === 'ended' && {
      opacity: 0.6,
      textDecoration: 'line-through',
      textDecorationColor: 'var(--mui-palette-text-subtle)',
    }),
    ...(r.contactId === selectedId && {
      boxShadow: (t: Theme) => `inset 3px 0 0 ${t.palette.primary.main}`,
      bgcolor: 'background.paper',
    }),
  });

  return (
    <DrawerSection
      title="Relations"
      action={
        <Button variant="text" onClick={() => setShowExtended((v) => !v)}>
          {showExtended ? 'Hide extended family' : 'Show extended family'}
        </Button>
      }
    >

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, my: 1 }}>
        <TextField
          placeholder="Search relations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {groups.map((g) => (
          <Chip
            key={g.category}
            variant={activeCats.has(g.category) ? 'filled' : 'outlined'}
            label={
              <>
                <Box component="span" sx={{ ...DOT_SX, bgcolor: catAccent(g.category) }} /> {g.category} · {g.total}
              </>
            }
            aria-pressed={activeCats.has(g.category)}
            onClick={() => toggleCat(g.category)}
            sx={{ color: `var(--cat-${g.category.toLowerCase()})`, borderColor: `var(--cat-${g.category.toLowerCase()})` }}
          />
        ))}
      </Box>

      <ContactRelationGraph
        centerId={contact.id}
        centerLabel={contact.displayName}
        includeInferred={showExtended}
        categories={activeCats}
        query={query}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {groups
        .filter((g) => activeCats.size === 0 || activeCats.has(g.category))
        .map((g) => {
          const explicit = g.explicit.filter(matches);
          const inferred = g.inferred.filter(matches);
          const shown = explicit.length + inferred.length;
          if (q && shown === 0) return null;
          const open = q ? true : (openCats[g.category] ?? g.total <= OPEN_THRESHOLD);
          return (
            <div key={g.category}>
              <ButtonBase
                onClick={() => setOpenCats((prev) => ({ ...prev, [g.category]: !open }))}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  width: '100%',
                  py: '6px',
                  mt: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'text.secondary',
                  justifyContent: 'flex-start',
                }}
              >
                <Box component="span" sx={{ ...DOT_SX, bgcolor: catAccent(g.category) }} />
                {g.category}{' '}
                <Box component="span" sx={{ fontWeight: 400, color: 'text.subtle' }}>
                  · {q ? `${shown}/${g.total}` : g.total}
                </Box>
                <Box component="span" sx={{ ml: 'auto', color: 'text.subtle' }}>
                  {open ? '▾' : '▸'}
                </Box>
              </ButtonBase>
              {open && explicit.map((r) => (
                <Box key={`rel-${r.contactId}-${r.kind}`} sx={rowSx(r, r.ended ? 'ended' : undefined)} onClick={rowSelect(r.contactId)}>
                  <Chip variant="outlined" label={r.kind} sx={{ color: `var(--cat-${g.category.toLowerCase()})`, borderColor: `var(--cat-${g.category.toLowerCase()})` }} />
                  <MuiLink component={Link} sx={{ flex: 1 }} to={link(r.contactId)}>
                    {r.displayName}
                  </MuiLink>
                  {r.label && <Typography variant="caption" sx={{ color: 'text.secondary' }}>“{r.label}”</Typography>}
                  {r.ended && <Typography variant="caption" sx={{ color: 'text.secondary' }}>· ended{r.until ? ` ${r.until}` : ''}</Typography>}
                  {r.ended ? (
                    <Tooltip title="Revive relationship">
                      <IconButton
                        disabled={add.isPending}
                        onClick={() =>
                          add.mutate({
                            id: contact.id,
                            data: { toContactId: r.contactId, kind: r.kind as ContactRelationKind, label: r.label ?? null, since: r.since ?? null, note: r.note ?? null },
                          })
                        }
                      >
                        <RestoreIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="End relationship (ran its course)">
                      <IconButton
                        disabled={end.isPending}
                        onClick={() => end.mutate({ id: contact.id, toContactId: r.contactId, data: { kind: r.kind as ContactRelationKind } })}
                      >
                        <PowerSettingsNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Remove relation (entered by mistake)">
                    <IconButton
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ id: contact.id, toContactId: r.contactId, params: { kind: r.kind as ContactRelationKind } })}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
              {open && inferred.map((r) => (
                <Box key={`kin-${r.contactId}-${r.kind}`} sx={rowSx(r, 'inferred')} onClick={rowSelect(r.contactId)}>
                  <Chip variant="outlined" label={r.kind} sx={{ color: `var(--cat-${g.category.toLowerCase()})`, borderColor: `var(--cat-${g.category.toLowerCase()})` }} />
                  <MuiLink component={Link} sx={{ flex: 1 }} to={link(r.contactId)}>
                    {r.displayName}
                  </MuiLink>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>· derived</Typography>
                </Box>
              ))}
            </div>
          );
        })}

      <WrapRow
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!toContactId) return;
          add.mutate({ id: contact.id, data: { toContactId, kind, label: label.trim() || null } });
          setToContactId('');
          setLabel('');
        }}
      >
        <TextField select value={toContactId} onChange={(e) => setToContactId(e.target.value)} slotProps={{ select: { displayEmpty: true } }}>
          <MenuItem value="">Relate a contact…</MenuItem>
          {pickable.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.displayName}
            </MenuItem>
          ))}
        </TextField>
        <TextField select value={kind} onChange={(e) => setKind(e.target.value as RelationKind)}>
          {RELATION_KINDS.map((k) => (
            <MenuItem key={k} value={k}>
              {k}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          placeholder="label (dad, boss…)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button variant="outlined" type="submit" disabled={!toContactId || add.isPending}>
          Add
        </Button>
      </WrapRow>
    </DrawerSection>
  );
}
