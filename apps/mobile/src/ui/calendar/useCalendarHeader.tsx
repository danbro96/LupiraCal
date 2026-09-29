import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLayoutEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Glyph } from '../components/Glyph';
import { IconButton } from '../components/IconButton';
import { SettingsButton } from '../components/SettingsButton';
import { ICONS } from '../icons';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useColors } from '../theme';

type Nav = CompositeNavigationProp<BottomTabNavigationProp<TabParamList, 'Calendar'>, NativeStackNavigationProp<RootStackParamList>>;

/** The Calendar tab's header is its period control: the title names the period and opens a date picker;
 *  Search, Today and the Month↔Week toggle sit beside the settings cog. Set via `setOptions` because every
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
          <IconButton name={ICONS.search} accessibilityLabel="Search events" onPress={() => navigation.navigate('ItemSearch')} />
          <IconButton name={ICONS.today} accessibilityLabel="Today" onPress={onToday} />
          <IconButton
            name={mode === 'month' ? ICONS.viewWeek : ICONS.viewMonth}
            accessibilityLabel={mode === 'month' ? 'Week view' : 'Month view'}
            onPress={onToggleMode}
          />
          <SettingsButton />
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
