import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useAuth } from '../../state/auth-store';
import { useStackScreenOptions } from '@danbro96/lupira-expo-paper/hooks/useStackScreenOptions';
import { AccountMenu } from '../components/AccountMenu';
import { AvailabilityEditScreen } from '../screens/AvailabilityEditScreen';
import { BridgeDiagnosticsScreen } from '../screens/BridgeDiagnosticsScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { ContactDetailScreen } from '../screens/ContactDetailScreen';
import { ContactEditScreen } from '../screens/ContactEditScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { DebugLogScreen } from '@danbro96/lupira-expo-diagnostics/DebugLogScreen';
import { DeveloperScreen } from '../screens/DeveloperScreen';
import { ItemDetailScreen } from '../screens/ItemDetailScreen';
import { ItemSearchScreen } from '../screens/ItemSearchScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { ItemEditScreen } from '../screens/ItemEditScreen';
import { ImportScreen } from '../screens/ImportScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AndroidSettingsScreen } from '../screens/AndroidSettingsScreen';
import { CalendarSettingsScreen } from '../screens/CalendarSettingsScreen';
import { SyncIssuesScreen } from '../screens/SyncIssuesScreen';
import type { RootStackParamList, TabParamList } from './types';
import { ICONS } from '../icons';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const tabIcon = (name: ComponentProps<typeof MaterialIcons>['name']) =>
  function TabIcon({ color }: { color: string }) {
    return <MaterialIcons name={name} color={color} size={24} />;
  };

function Tabs() {
  return (
    // A visited tab stays mounted; freezing stops it re-rendering while hidden.
    <Tab.Navigator screenOptions={{ headerShown: true, freezeOnBlur: true, headerRight: () => <AccountMenu /> }}>
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calendar', tabBarIcon: tabIcon(ICONS.calendar) }} />
      <Tab.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Contacts', tabBarIcon: tabIcon(ICONS.group) }} />
    </Tab.Navigator>
  );
}

export function RootStack() {
  const authed = useAuth((s) => s.authMode === 'dev' || s.token !== null);
  return (
    <Stack.Navigator screenOptions={useStackScreenOptions()}>
      {authed ? (
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false, contentStyle: { paddingBottom: 0 } }} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="CalendarSettings" component={CalendarSettingsScreen} options={{ title: 'Calendar' }} />
      <Stack.Screen name="AndroidSettings" component={AndroidSettingsScreen} options={{ title: 'Android integration' }} />
      <Stack.Screen name="SyncIssues" component={SyncIssuesScreen} options={{ title: 'Sync issues' }} />
      <Stack.Screen name="DebugLog" component={DebugLogScreen} options={{ title: 'Debug log' }} />
      <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: 'Event' }} />
      <Stack.Screen name="ItemSearch" component={ItemSearchScreen} options={{ title: 'Search events' }} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task' }} />
      <Stack.Screen
        name="ItemEdit"
        component={ItemEditScreen}
        options={({ route }) => ({ title: route.params?.itemId ? 'Edit event' : 'New event' })}
      />
      <Stack.Screen name="ContactDetail" component={ContactDetailScreen} options={{ title: 'Contact' }} />
      <Stack.Screen name="ContactEdit" component={ContactEditScreen} options={{ title: 'Edit contact' }} />
      <Stack.Screen name="Developer" component={DeveloperScreen} options={{ title: 'Developer' }} />
      <Stack.Screen name="BridgeDiagnostics" component={BridgeDiagnosticsScreen} options={{ title: 'Bridge diagnostics' }} />
      <Stack.Screen name="AvailabilityEdit" component={AvailabilityEditScreen} options={{ title: 'Set availability' }} />
      <Stack.Screen name="Import" component={ImportScreen} options={{ title: 'Import' }} />
    </Stack.Navigator>
  );
}
