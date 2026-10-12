import { toast } from '@danbro96/lupira-expo-feedback/toast';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { SyncStatusView } from '@danbro96/lupira-expo-paper/components/SyncStatusView';
import type { OpBase } from '@danbro96/lupira-sync-engine/types';
import { AGGREGATE_LABELS } from '../../domain/aggregates';
import { OP_LABELS, type OpKind } from '../../domain/ops';
import { engine } from '../../sync/engine';
import { useParkedOps } from '../../state/useParkedOps';
import { useSyncStatus } from '../../state/useSyncStatus';

const labelOf = (op: OpBase) => OP_LABELS[op.kind as OpKind] ?? op.kind;

/** The review surface for offline writes; discard also rolls the optimistic mirror write back to server truth. */
export function SyncIssuesScreen() {
  const { data: parked = [] } = useParkedOps();
  const status = useSyncStatus();
  const online = useOnline();

  return (
    <SyncStatusView
      status={online ? status : { ...status, phase: 'idle', progress: null }}
      parked={parked}
      opLabel={labelOf}
      online={online}
      progressLabels={AGGREGATE_LABELS}
      onSync={() => {
        if (online) void engine.sync();
        else toast('Offline — changes sync when you reconnect');
      }}
      onRetry={(commandId) => void engine.retry(commandId)}
      onDiscard={(commandId) => void engine.discard(commandId)}
    />
  );
}
