import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/** While `active` and the screen is focused, Android Back runs `dismiss` instead of leaving the screen.
 *  Focus-scoped so a screen pushed on top still gets Back first. */
export function useBackDismiss(active: boolean, dismiss: () => void) {
  useFocusEffect(useCallback(() => {
    if (!active) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [active, dismiss]));
}
