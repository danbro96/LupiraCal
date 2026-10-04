import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Settings: undefined;
  CalendarSettings: undefined;
  AndroidSettings: undefined;
  Login: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** Reachable from Login too — switching to the LAN preset must not require signing in first. */
  Developer: undefined;
  SyncIssues: undefined;
  DebugLog: undefined;
  ItemDetail: { itemId: string };
  ItemSearch: undefined;
  /** Read-only view of a LupiraTasks deadline (online-only; the tasks API addresses items list-scoped). */
  TaskDetail: { listId: string; itemId: string };
  /** No itemId = create; `day`/`time` pre-fill the start from the grid selection (slot taps send both). */
  ItemEdit: { itemId?: string; day?: string; time?: string } | undefined;
  ContactDetail: { contactId: string };
  ContactEdit: { contactId?: string } | undefined;
  BridgeDiagnostics: undefined;
  /** Availability quick-add: status + date range, prefilled from the tapped day. */
  AvailabilityEdit: { day?: string } | undefined;
};

export type TabParamList = {
  Calendar: undefined;
  Contacts: undefined;
};
