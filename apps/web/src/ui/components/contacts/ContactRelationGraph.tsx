import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Background, Controls, Handle, MarkerType, Panel, Position, ReactFlow } from '@xyflow/react';
import type { Edge, Node, NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getListContactRelationsQueryKey, listContactRelations } from '@lupira/cal-api/query/contact';
import type { ContactRelationEntryDto } from '@lupira/cal-api/models';
import { buildRelationGraph } from '@lupira/cal-domain/contactRelations';
import { matchesTerms, searchTerms } from '@danbro96/lupira-domain-core/textSearch';
import type { RelationCategory } from '@lupira/cal-domain/contactRelations';
import { useIsPhone } from '../../hooks/useIsPhone';

// The node border reads the category accent directly; only the xyflow edge (which has no element
// to hang sx on) still needs a class. Written out per category because Tailwind scans for literals.
const CAT_ACCENT: Record<RelationCategory, string> = {
  Family: 'var(--cat-family)',
  Social: 'var(--cat-social)',
  Professional: 'var(--cat-professional)',
  Other: 'var(--cat-other)',
};

// xyflow reads its own custom props, so category colour needs no descendant selector.
// Written out per category because Tailwind scans for literal class names.
const EDGE_STROKE: Record<RelationCategory, string> = {
  Family: '[--xy-edge-stroke:var(--color-cat-family)]',
  Social: '[--xy-edge-stroke:var(--color-cat-social)]',
  Professional: '[--xy-edge-stroke:var(--color-cat-professional)]',
  Other: '[--xy-edge-stroke:var(--color-cat-other)]',
};
// Grows on touch, where the bare glyph is under the target size.
const EXPAND_SX = {
  color: 'inherit',
  fontSize: 14,
  lineHeight: 1,
  p: 0,
  '@media (pointer: coarse)': { fontSize: 16, p: 1, m: '-8px -2px' },
} as const;

const EDGE_BASE =
  '[--xy-edge-stroke-width:1.5] [--xy-edge-label-color:var(--mui-palette-text-secondary)]';

type RelationNodeData = {
  label: string;
  category: RelationCategory | 'self';
  isCenter: boolean;
  expanded: boolean;
  selected: boolean;
  hit: boolean;
  dimmed: boolean;
  onExpand: (id: string) => void;
  onNavigate: (id: string) => void;
};
type RelationFlowNode = Node<RelationNodeData, 'relation'>;

/** Chip node with centered (hidden) handles so straight edges read as radial spokes. */
function RelationNode({ id, data }: NodeProps<RelationFlowNode>) {
  const accent = data.category === 'self' ? CAT_ACCENT.Other : CAT_ACCENT[data.category];
  return (
    <Box
      title={data.label}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        maxWidth: 170,
        p: '5px 11px',
        fontSize: 12,
        fontWeight: data.isCenter ? 700 : 600,
        color: data.isCenter ? 'primary.contrastText' : 'text.primary',
        bgcolor: data.isCenter ? 'primary.main' : 'background.default',
        border: 2,
        borderColor: data.isCenter ? 'primary.main' : accent,
        borderRadius: '999px',
        cursor: 'pointer',
        // selected outranks hit — a selected node is also a hit when the search matches it.
        ...(data.hit && { boxShadow: (t) => `0 0 0 2px ${t.palette.primary.main}` }),
        ...(data.selected && { boxShadow: (t) => `0 0 0 3px ${t.palette.primary.main}` }),
        ...(data.dimmed && { opacity: 0.25 }),
      }}
    >
      <Handle type="target" position={Position.Top} className="top-1/2! min-w-0! min-h-0! opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Top} className="top-1/2! min-w-0! min-h-0! opacity-0" isConnectable={false} />
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.label}
      </Box>
      {data.selected && !data.isCenter && (
        <ButtonBase
          title="Open contact"
          onClick={(e) => {
            e.stopPropagation();
            data.onNavigate(id);
          }}
          sx={EXPAND_SX}
        >
          ↗
        </ButtonBase>
      )}
      {!data.isCenter && !data.expanded && (
        <ButtonBase
          title="Expand relations"
          onClick={(e) => {
            e.stopPropagation();
            data.onExpand(id);
          }}
          sx={EXPAND_SX}
        >
          ＋
        </ButtonBase>
      )}
    </Box>
  );
}

const nodeTypes = { relation: RelationNode };

/** Interactive ego-graph: center contact + expand-on-click neighbours, one query per fetched node.
 *  Inferred kin (grandparents, cousins, …) are fetched for the center only and drawn as dashed spokes.
 *  Click selects (syncs with the list); ↗ on the selected pill or double-click opens the contact. */
export function ContactRelationGraph({
  centerId,
  centerLabel,
  includeInferred,
  categories,
  query,
  selectedId,
  onSelect,
}: {
  centerId: string;
  centerLabel: string;
  includeInferred: boolean;
  categories: ReadonlySet<RelationCategory>;
  query: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isPhone = useIsPhone();
  const [expandedIds, setExpandedIds] = useState<string[]>([centerId]);
  const [fullscreen, setFullscreen] = useState(false);
  const expand = (id: string) => setExpandedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  const open = (id: string) => navigate({ pathname: `/contacts/${id}`, search: location.search });

  const results = useQueries({
    queries: expandedIds.map((id) => {
      const params = id === centerId && includeInferred ? { includeInferred: true } : undefined;
      return { queryKey: getListContactRelationsQueryKey(id, params), queryFn: () => listContactRelations(id, params) };
    }),
  });

  const entriesByContact = useMemo(() => {
    const m = new Map<string, ContactRelationEntryDto[]>();
    expandedIds.forEach((id, i) => {
      const data = results[i]?.data;
      if (data) m.set(id, data);
    });
    return m;
  }, [expandedIds, results]);

  const graph = useMemo(
    () => buildRelationGraph({ id: centerId, label: centerLabel }, entriesByContact, { categories }),
    [centerId, centerLabel, entriesByContact, categories],
  );

  const terms = searchTerms(query);
  const expandedSet = new Set(expandedIds);
  const rfNodes: RelationFlowNode[] = graph.nodes.map((n) => {
    const hit = terms.length > 0 && matchesTerms(terms, n.label);
    return {
      id: n.id,
      type: 'relation',
      position: { x: n.x, y: n.y },
      data: {
        label: n.label,
        category: n.category,
        isCenter: n.isCenter,
        expanded: expandedSet.has(n.id),
        selected: n.id === selectedId,
        hit,
        dimmed: terms.length > 0 && !hit,
        onExpand: expand,
        onNavigate: open,
      },
    };
  });
  const rfEdges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label ?? e.kind,
    type: 'straight',
    className: `${EDGE_BASE} ${EDGE_STROKE[e.category]}${
      e.inferred ? ' opacity-75 [stroke-dasharray:5_4]' : ''
    }`,
    markerEnd: e.directed ? { type: MarkerType.ArrowClosed } : undefined,
  }));

  if (results[0]?.isLoading) return <Typography variant="caption" sx={{ color: 'text.secondary' }} component="p">Loading relations…</Typography>;
  if (graph.edges.length === 0)
    return <Typography component="p" sx={{ textAlign: 'center', color: 'text.subtle', mt: 6 }}>{categories.size > 0 ? 'No relations in the selected categories.' : 'No relations yet.'}</Typography>;

  const flow = (
    <ReactFlow
      key={[...categories].sort().join(',')} // reshaped layout on filter change → refit the view
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      colorMode="system"
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.2}
      onlyRenderVisibleElements
      nodesConnectable={false}
      onNodeClick={(_, node) => onSelect(node.id === selectedId ? null : node.id)}
      onNodeDoubleClick={(_, node) => {
        if (node.id !== centerId) open(node.id);
      }}
      onPaneClick={() => onSelect(null)}
    >
      <Background />
      <Controls showInteractive={false} />
      <Panel position="top-right">
        <Tooltip title={fullscreen ? 'Close' : 'Fullscreen'}>
          <IconButton onClick={() => setFullscreen((v) => !v)}>
            {fullscreen ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Panel>
    </ReactFlow>
  );

  if (fullscreen)
    return (
      <Dialog open onClose={() => setFullscreen(false)} fullScreen>
        <Box
          sx={{
            // Fullscreen: fill the dialog, and on a phone take the flex slack instead of a fixed vh.
            height: { xs: 'auto', md: '84vh' },
            flex: { xs: 1, md: 'none' },
            resize: 'none',
            overflow: 'hidden',
          }}
        >
          {flow}
        </Box>
      </Dialog>
    );
  // The inline embed is unusable at phone width — offer the fullscreen modal instead.
  if (isPhone)
    return (
      <Button variant="outlined" startIcon={<OpenInFullIcon />} onClick={() => setFullscreen(true)}>
        Open relation graph
      </Button>
    );
  return (
    <Box
      sx={{
        height: 400,
        minHeight: 300,
        maxHeight: '85vh',
        resize: 'vertical',
        border: 1,
        borderColor: 'border',
        borderRadius: 1,
        bgcolor: 'background.paper',
        my: 1,
        mb: 1.5,
        overflow: 'hidden',
      }}
    >
      {flow}
    </Box>
  );
}
