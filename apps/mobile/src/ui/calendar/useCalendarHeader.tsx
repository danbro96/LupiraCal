import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLayoutEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Glyph } from '@danbro96/lupira-expo-paper/components/Glyph';
import { HeaderActions } from '@danbro96/lupira-expo-paper/components/HeaderActions';
import { AccountMenu } from '../components/AccountMenu';
import { ICONS } from '../icons';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useColors } from '../theme';

type Nav = CompositeNavigationProp<BottomTabNavigationProp<TabParamList, 'Calendar'>, NativeStackNavigationProp<RootStackParamList>>;

/** The Calendar tab's header is its period control: the title names the period and opens a date picker;
 *  Search sits beside the account avatar; Today and the Month↔Week toggle are in the overflow menu. Set via `setOptions` because every
 *  part of it follows screen state. */
export function useCalendarHeader({ title, mode, anchor, onToday, onPickDate, onToggleMode }: {
  title: string;
  mode: 'month' | 'week';
  anchor: Date;
  onToday: () => void;
  onPickDate: (date: Date) => void;
  onToggleMode: () => void;
}) {
  const c = useColors();
  const navigation = useNavigation<Nav>();

  useLayoutEffect(() => {
    const pickDate = () => DateTimePickerAndroid.open({
      value: anchor,
      mode: 'date',
      onChange: (e, d) => {
        if (e.type === 'set' && d) onPickDate(d);
      },
    });
    navigation.setOptions({
      headerTitle: () => (
        <Pressable style={styles.titleButton} onPress={pickDate} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${title}, pick a date`}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{title}</Text>
          <Text style={{ color: c.textMuted }}><Glyph name={ICONS.dropDown} size={22} /></Text>
        </Pressable>
      ),
      headerRight: () => (
        <View style={styles.actions}>
          <HeaderActions
            actions={[{ icon: ICONS.search, label: 'Search events', onPress: () => navigation.navigate('ItemSearch') }]}
            overflow={[
              { label: 'Today', onPress: onToday },
              { label: mode === 'month' ? 'Week view' : 'Month view', onPress: onToggleMode },
            ]}
          />
          <AccountMenu />
        </View>
      ),
    });
  }, [navigation, title, mode, anchor, onToday, onPickDate, onToggleMode, c.text, c.textMuted]);
}

const styles = StyleSheet.create({
  titleButton: { flexShrink: 1, flexDirection: 'row', alignItems: 'center' },
  title: { flexShrink: 1, fontSize: 20, fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
