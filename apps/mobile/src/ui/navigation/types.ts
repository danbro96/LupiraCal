import type { NavigatorScreenParams } from '@react-navigation/native';
import type { PhotoQueryFilters } from '../../state/usePhotoLibrary';

export type RootStackParamList = {
  Settings: undefined;
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
  /** Filters ride the route so the viewer's paging query hits the grid's cache entry, not the network. */
  PhotoViewer: { photoId: string; filters?: PhotoQueryFilters };
  BridgeDiagnostics: undefined;
  /** Availability quick-add: status + date range, prefilled from the tapped day. */
  AvailabilityEdit: { day?: string } | undefined;
};

export type MapTarget = { lon: number; lat: number; focus?: 'photo' | 'place' };

export type TabParamList = {
  Calendar: undefined;
  Contacts: undefined;
  /** `at` flies to one point and pins it — how an event, contact address or photo hands itself over.
   *  Only a photo focus turns the photo layer on. */
  Map: { at?: MapTarget } | undefined;
  /** Local day bounds, 'yyyy-MM-dd' — how a map pin hands over "everything from this day"; `event`
   *  is how an event hands over its linked photos. */
  Photos: { from?: string; to?: string; event?: string } | undefined;
};
