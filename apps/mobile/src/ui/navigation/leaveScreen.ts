import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';

/** A screen opened from another app can be the only one in the stack; leaving it lands on the tabs. */
export function leaveScreen(navigation: NativeStackNavigationProp<RootStackParamList>): void {
  if (navigation.canGoBack()) navigation.goBack();
  else navigation.replace('Tabs');
}
