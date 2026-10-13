import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { SegmentedPicker } from '@danbro96/lupira-expo-paper/components/SegmentedPicker';
import { SettingsAction } from '@danbro96/lupira-expo-paper/components/SettingsAction';
import { SettingsNote } from '@danbro96/lupira-expo-paper/components/SettingsNote';
import { DEFAULT_MINUTE_OPTIONS, leadLabel, REPLY_LEAD_OPTIONS, type NotifyPrefs } from '../../domain/notificationPrefs';
import { usePrefs } from '../../state/prefs-store';
import { allowNotifications, useNotificationAccess } from '../../state/useNotificationAccess';
import { TimeField } from '../components/TimeField';
import { spacing } from '../theme';

type Flag = { [K in keyof NotifyPrefs]: NotifyPrefs[K] extends boolean ? K : never }[keyof NotifyPrefs];

const minuteOptions = DEFAULT_MINUTE_OPTIONS.map(String);
const replyOptions = REPLY_LEAD_OPTIONS.map(String);

export function NotificationSettingsScreen() {
  const notify = usePrefs((p) => p.notify);
  const loaded = usePrefs((p) => p.loaded);
  const { data: access } = useNotificationAccess();
  const set = usePrefs((p) => p.setNotify);

  const toggle = (key: Flag, title: string, description?: string) => (
    <List.Item
      title={title}
      description={description}
      right={() => <Switch value={notify[key]} onValueChange={(v) => void set(key, v)} disabled={!loaded} />}
    />
  );
  const denied = !!access && access.permission !== 'granted';
  const allow = () => {
    if (access && access.permission === 'undetermined' && access.canAskAgain) void allowNotifications();
    else void Linking.openSettings();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {denied && <SettingsAction onPress={allow}>Notifications are off for Lupira Calendar — tap to allow them</SettingsAction>}
      {!!access && !access.exact && (
        <SettingsNote>Exact alarms aren’t allowed on this phone, so reminders may come a few minutes late.</SettingsNote>
      )}

      <List.Subheader>Events</List.Subheader>
      {toggle('eventReminders', 'Your reminders', 'The ones you set on an event')}
      {toggle('defaultReminder', 'Default reminder', 'Timed events you’re going to without one of their own')}
      {notify.defaultReminder && (
        <View style={styles.picker}>
          <SegmentedPicker
            options={minuteOptions}
            selected={String(notify.defaultMinutes)}
            onSelect={(v) => void set('defaultMinutes', Number(v))}
            getLabel={(v) => leadLabel(Number(v))}
          />
        </View>
      )}

      <List.Subheader>Every day</List.Subheader>
      {toggle('morningSummary', 'Morning summary', 'What’s on today, trips included')}
      {notify.morningSummary && <TimeRow value={notify.morningTime} onChange={(v) => void set('morningTime', v)} />}
      {toggle('birthdays', 'Birthdays')}
      {notify.birthdays && <TimeRow value={notify.birthdayTime} onChange={(v) => void set('birthdayTime', v)} />}
      <SettingsNote>All-day events with a reminder of their own count back from the morning time.</SettingsNote>

      <List.Subheader>Invitations</List.Subheader>
      {toggle('askWhenInvited', 'Ask when invited', 'Answer Going, Maybe or Not going from the notification')}
      {toggle('remindToReply', 'Remind me to reply', 'Before an event you haven’t answered')}
      {notify.remindToReply && (
        <View style={styles.picker}>
          <SegmentedPicker
            options={replyOptions}
            selected={String(notify.replyLeadMinutes)}
            onSelect={(v) => void set('replyLeadMinutes', Number(v))}
            getLabel={(v) => leadLabel(Number(v))}
          />
        </View>
      )}
    </ScrollView>
  );
}

function TimeRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.picker}>
      <TimeField clearable={false} value={value} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.sm },
  picker: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
