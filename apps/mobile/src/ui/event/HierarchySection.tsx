import { displayTitle } from '@danbro96/lupira-domain-events/itemLabels';
import { fmtWhen } from '@danbro96/lupira-domain-core/time';
import { StyleSheet, View } from 'react-native';
import { List } from 'react-native-paper';
import type { HierarchyRow } from '../../data/queries/hierarchy';
import { useItemHierarchy } from '../../state/useItemHierarchy';
import { useCalendarColors } from '../hooks/palette';
import { spacing } from '../theme';

/** Parent link + direct children (parentItemId nesting, not relations), from the mirror. */
export function HierarchySection({ itemId, parentId, onOpen }: {
  itemId: string;
  parentId: string | null;
  onOpen: (itemId: string) => void;
}) {
  const { data } = useItemHierarchy(itemId, parentId);
  if (!data || (!data.parent && data.children.length === 0)) return null;

  return (
    <View>
      <List.Subheader>Hierarchy</List.Subheader>
      {data.parent && <HierarchyItem row={data.parent} title={`Part of ${displayTitle(data.parent.title)}`} onOpen={onOpen} />}
      {data.children.map((r) => (
        <HierarchyItem
          key={r.id}
          row={r}
          title={displayTitle(r.title)}
          description={r.start_utc ? fmtWhen(r.start_utc, r.is_all_day === 1) : 'No date'}
          onOpen={onOpen}
        />
      ))}
    </View>
  );
}

function HierarchyItem({ row, title, description, onOpen }: {
  row: HierarchyRow;
  title: string;
  description?: string;
  onOpen: (itemId: string) => void;
}) {
  const colorOf = useCalendarColors();
  return (
    <List.Item
      onPress={() => onOpen(row.id)}
      title={title}
      description={description}
      style={styles.dense}
      left={() => <View style={[styles.dot, { backgroundColor: colorOf(row.calendar_id, 'item', row.color) }]} />}
    />
  );
}

const styles = StyleSheet.create({
  dense: { paddingVertical: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, alignSelf: 'center', marginLeft: spacing.lg },
});
