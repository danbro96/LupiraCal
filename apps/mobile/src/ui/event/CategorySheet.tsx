import { ScrollView } from 'react-native';
import { List } from 'react-native-paper';
import { ITEM_CATEGORY_ICONS, type ItemCategoryName } from '@lupira/cal-tokens/icons';
import { Sheet } from '@danbro96/lupira-expo-paper/components/Sheet';
import { ICONS } from '../icons';
import { useColors } from '../theme';

export const ITEM_CATEGORIES = Object.keys(ITEM_CATEGORY_ICONS) as ItemCategoryName[];

export function categoryIcon(category: string) {
  return ICONS[ITEM_CATEGORY_ICONS[category as ItemCategoryName] ?? 'event'];
}

/** No "none" row: the REST contract can't clear a category, so offering it would silently do nothing. */
export function CategorySheet({ value, onPick, onDismiss }: {
  value: string;
  onPick: (category: ItemCategoryName) => void;
  onDismiss: () => void;
}) {
  const c = useColors();
  return (
    <Sheet title="Category" onDismiss={onDismiss}>
      <ScrollView>
        {ITEM_CATEGORIES.map((cat) => (
          <List.Item
            key={cat}
            title={cat}
            left={(props) => <List.Icon {...props} icon={categoryIcon(cat)} />}
            right={() => (cat === value ? <List.Icon icon={ICONS.check} color={c.primary} /> : null)}
            onPress={() => {
              onPick(cat);
              onDismiss();
            }}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}
