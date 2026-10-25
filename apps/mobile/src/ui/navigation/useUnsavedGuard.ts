import { useNavigation } from '@react-navigation/native';
import { useEffect, useEffectEvent, useRef } from 'react';
import { Alert } from 'react-native';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';

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
  // The alert outlives the render that opened it; Save must persist the form as it is when pressed.
  const save = useRef(opts.onSave);
  useEffect(() => {
    save.current = opts.onSave;
  });
  const confirmLeave = useEffectEvent((proceed: () => void) => {
    const { message = 'Discard your changes?', onSave } = opts;
    Alert.alert('Unsaved changes', message, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: proceed },
      ...(onSave
        ? [{
          text: 'Save',
          onPress: () => {
            save.current?.()
              .then((saved) => {
                if (saved) proceed();
              })
              .catch(() => toastError('Could not save.'));
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
