import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView } from 'react-native';
import { List, Switch } from 'react-native-paper';
import { isCalendarShown } from '@lupira/cal-domain/calendars';
import { useOnline } from '@danbro96/lupira-expo-query/online';
import { fmtDateTime } from '@danbro96/lupira-domain-core/time';
import { useAuth } from '../../state/auth-store';
import { useBridge } from '../../state/bridge-store';
import { usePrefs } from '../../state/prefs-store';
import { useCalendars } from '../../state/useContainers';
import { useNotificationAccess } from '../../state/useNotificationAccess';
import { useSyncStatus } from '../../state/useSyncStatus';
import { engine } from '../../sync/engine';
import { IconButton } from '@danbro96/lupira-expo-paper/components/IconButton';
import { IdentityHeader } from '@danbro96/lupira-expo-paper/components/IdentityHeader';
import { SignOutButton } from '@danbro96/lupira-expo-paper/components/SignOutButton';
import { VersionLine } from '@danbro96/lupira-expo-diagnostics/VersionLine';
import { ICONS } from '../icons';
import type { RootStackParamList } from '../navigation/types';
import { useColors } from '../theme';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';

const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' · ');

/** Identity, then one row per area with its state in the description, each opening its own screen. Something
 *  that needs you (a missing permission) shows in the warning colour, so nothing has to be opened to find it.
 *  Developer tooling stays behind the debug switch. */
export function SettingsScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { authMode, user } = useAuth();
  const prefs = usePrefs();
  const { data: calendars } = useCalendars();
  const bridge = useBridge();
  const { phase, pending, parked, lastSyncAt } = useSyncStatus();
  const online = useOnline();
  const { data: access } = useNotificationAccess();

  const chevron = () => <List.Icon icon={ICONS.chevronRight} />;
  const icon = (name: string) => (p: { color: string; style?: object }) => <List.Icon {...p} icon={name} />;
  const attention = { color: c.warning };

  const hidden = (calendars ?? []).filter((cal) => cal.class !== 'System' && !isCalendarShown(cal, prefs.calendarChoices)).length;
  const calendar = join(
    hidden > 0 && `${hidden} hidden`,
    prefs.showTaskDeadlines ? 'Deadlines on' : 'Deadlines off',
    `${prefs.allDayRows === 'all' ? 'All' : prefs.allDayRows} all-day row${prefs.allDayRows === '1' ? '' : 's'}`,
  );
  const androidAttention = !bridge.permissionsOk || (bridge.enabled && bridge.status?.accountPresent === false);
  const android = !bridge.enabled ? 'Off' : join(
    bridge.status?.accountPresent === false ? 'Needs repair' : 'On',
    !bridge.permissionsOk && 'permissions missing',
  );
  const notifyFlags = [prefs.notify.eventReminders, prefs.notify.defaultReminder, prefs.notify.morningSummary,
    prefs.notify.birthdays, prefs.notify.askWhenInvited, prefs.notify.remindToReply];
  const notifyOn = notifyFlags.filter(Boolean).length;
  const notifyDenied = !!access && access.permission !== 'granted';
  const notify = notifyDenied
    ? 'Not allowed on this phone'
    : notifyOn === notifyFlags.length ? 'All on' : notifyOn === 0 ? 'Off' : `${notifyOn} of ${notifyFlags.length} on`;
  const issues = pending + parked;
  const sync = join(
    online && phase !== 'idle' ? 'Syncing…' : lastSyncAt ? `Synced ${fmtDateTime(new Date(lastSyncAt))}` : 'Not synced yet',
    issues > 0 && `${issues} waiting`,
  );

  return (
    <ScrollView>
      <List.Subheader>Account</List.Subheader>
      <IdentityHeader
        name={authMode === 'dev' ? 'Dev auto-auth' : user?.name ?? user?.sub ?? 'Signed out'}
        sub={authMode === 'dev' ? 'No sign-in' : user?.name ? user.sub : undefined}
      />
      {authMode !== 'dev' && <SignOutButton onSignOut={() => void useAuth.getState().clearSession().catch(() => toastError('Could not sign out.'))} />}

      <List.Subheader>Calendar</List.Subheader>
      <List.Item
        title="Calendar"
        description={calendar}
        left={icon(ICONS.calendar)}
        right={chevron}
        onPress={() => navigation.navigate('CalendarSettings')}
      />
      <List.Item
        title="Notifications"
        description={notify}
        descriptionStyle={notifyDenied ? attention : undefined}
        left={icon(ICONS.notifications)}
        right={chevron}
        onPress={() => navigation.navigate('NotificationSettings')}
      />
      <List.Item
        title="Android integration"
        description={android}
        descriptionStyle={androidAttention ? attention : undefined}
        left={icon(ICONS.phone)}
        right={chevron}
        onPress={() => navigation.navigate('AndroidSettings')}
      />
      <List.Item
        title="Sync"
        description={sync}
        descriptionStyle={parked > 0 ? attention : undefined}
        left={icon(ICONS.sync)}
        right={() => (
          <IconButton name={ICONS.sync} onPress={() => {
            engine.sync();
          }} accessibilityLabel="Sync now" />
        )}
        onPress={() => navigation.navigate('SyncIssues')}
      />

      <List.Subheader>Developer</List.Subheader>
      <List.Item
        title="Enable debug"
        description="Developer tools and the on-device log"
        left={icon(ICONS.tools)}
        right={() => (
          <Switch
            value={prefs.debugEnabled}
            onValueChange={(v) => void usePrefs.getState().setDebugEnabled(v).catch(() => toastError('Could not save the setting.'))}
            accessibilityLabel="Enable debug"
          />
        )}
      />
      {prefs.debugEnabled && (
        <List.Item title="Developer options" left={icon(ICONS.tune)} right={chevron} onPress={() => navigation.navigate('Developer')} />
      )}

      <List.Subheader>About</List.Subheader>
      <VersionLine />
    </ScrollView>
  );
}
