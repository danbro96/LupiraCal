import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { useAuth } from '../../state/auth-store';
import { SettingsButton } from '../components/SettingsButton';
import { AvailabilityEditScreen } from '../screens/AvailabilityEditScreen';
import { BridgeDiagnosticsScreen } from '../screens/BridgeDiagnosticsScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { ContactDetailScreen } from '../screens/ContactDetailScreen';
import { ContactEditScreen } from '../screens/ContactEditScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { DebugLogScreen } from '../screens/DebugLogScreen';
import { DeveloperScreen } from '../screens/DeveloperScreen';
import { ItemDetailScreen } from '../screens/ItemDetailScreen';
import { ItemSearchScreen } from '../screens/ItemSearchScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { ItemEditScreen } from '../screens/ItemEditScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MapScreen } from '../screens/MapScreen';
import { PhotosScreen } from '../screens/PhotosScreen';
import { PhotoViewerScreen } from '../screens/PhotoViewerScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
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
    // A visited tab stays mounted; freezing stops it re-rendering (the map on every GPS fix) while hidden.
    <Tab.Navigator screenOptions={{ headerShown: true, freezeOnBlur: true, headerRight: () => <SettingsButton /> }}>
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calendar', tabBarIcon: tabIcon(ICONS.calendar) }} />
      <Tab.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Contacts', tabBarIcon: tabIcon(ICONS.group) }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Map', tabBarIcon: tabIcon(ICONS.map) }} />
      <Tab.Screen name="Photos" component={PhotosScreen} options={{ title: 'Photos', tabBarIcon: tabIcon(ICONS.photos) }} />
    </Tab.Navigator>
  );
}

export function RootStack() {
  const authed = useAuth((s) => s.authMode === 'dev' || s.token !== null);
  return (
    <Stack.Navigator>
      {authed ? (
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
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
      <Stack.Screen name="PhotoViewer" component={PhotoViewerScreen} options={{ title: 'Photo' }} />
      <Stack.Screen name="Developer" component={DeveloperScreen} options={{ title: 'Developer' }} />
      <Stack.Screen name="BridgeDiagnostics" component={BridgeDiagnosticsScreen} options={{ title: 'Bridge diagnostics' }} />
      <Stack.Screen name="AvailabilityEdit" component={AvailabilityEditScreen} options={{ title: 'Set availability' }} />
    </Stack.Navigator>
  );
}
