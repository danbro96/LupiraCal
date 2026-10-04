import { useNavigation } from '@react-navigation/native';
import { useEffect, useEffectEvent, useRef } from 'react';
import { Alert } from 'react-native';

type Options = {
  message?: string;
  /** Resolves true when the form was persisted — the pending navigation then continues. */
  onSave?: () => Promise<boolean>;
};

/** Intercepts every way out of a form — header arrow, hardware/gesture back — while there are unsaved
 *  edits, offering Save / Discard / Keep editing. `beforeRemove` is the one hook that covers all exit
 *  routes. Returns `leave()`, which the screen calls before its own post-save goBack so the guard
 *  doesn't re-intercept it (the form state is still "dirty" at that moment). */
export function useUnsavedGuard(dirty: boolean, opts: Options = {}): { leave: () => void } {
  const navigation = useNavigation();
  const bypass = useRef(false);
  const confirmLeave = useEffectEvent((proceed: () => void) => {
    const { message = 'Discard your changes?', onSave } = opts;
    Alert.alert('Unsaved changes', message, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: proceed },
      ...(onSave
        ? [{
          text: 'Save',
          onPress: () => {
            void onSave().then((saved) => {
              if (saved) proceed();
            });
          },
        }]
        : []),
    ]);
  });

  useEffect(() => {
    if (!dirty) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (bypass.current) return;
      e.preventDefault();
      confirmLeave(() => {
        bypass.current = true;
        navigation.dispatch(e.data.action);
      });
    });
  }, [navigation, dirty]);

  return { leave: () => { bypass.current = true; } };
}
