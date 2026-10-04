import { useEffect, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet } from 'react-native';
import { Portal, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../theme';
import { SCRIM } from '@danbro96/lupira-tokens-core/color';

/** A modal picker sheet: bottom-anchored, or top-anchored when it holds a search box so the keyboard never
 *  covers the results. Hardware back closes the sheet rather than the screen under it. */
export function Sheet({ title, anchor = 'bottom', onDismiss, children }: {
  title?: string;
  anchor?: 'top' | 'bottom';
  onDismiss: () => void;
  children: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => sub.remove();
  }, [onDismiss]);

  const top = anchor === 'top';
  return (
    <Portal>
      <Pressable style={[styles.backdrop, top ? styles.alignTop : styles.alignBottom]} onPress={onDismiss}>
        <Pressable
          style={[
            top ? styles.topSheet : styles.bottomSheet,
            { backgroundColor: c.surface, paddingTop: top ? insets.top + 8 : 16, paddingBottom: top ? 12 : insets.bottom + 12 },
          ]}
        >
          {title && <Text style={[styles.title, { color: c.text }]}>{title}</Text>}
          {children}
        </Pressable>
      </Pressable>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: SCRIM.backdrop },
  alignTop: { justifyContent: 'flex-start' },
  alignBottom: { justifyContent: 'flex-end' },
  bottomSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, maxHeight: '80%' },
  topSheet: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, paddingHorizontal: 16, maxHeight: '85%' },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
});
