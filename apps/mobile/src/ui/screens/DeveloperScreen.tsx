import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, List, RadioButton, Text } from 'react-native-paper';
import { API_PRESETS, DIAGNOSTIC_ROUTES, type AuthMode } from '../../config';
import { presetFor, useAuth } from '../../state/auth-store';
import { useSyncStatus } from '../../sync/syncStatus';
import { Input } from '../components/Input';
import type { RootStackParamList } from '../navigation/types';
import { useColors, spacing } from '../theme';

/** Developer tooling, deliberately out of the user path: backend switching (a family member on the
 *  LAN preset has a silently dead app), diagnostics links, raw sync state. Reachable from Settings
 *  and from the login screen (switching backends must not require signing in first). */
export function DeveloperScreen() {
  const c = useColors();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { apiUrl, authMode } = useAuth();
  const sync = useSyncStatus();
  const activeKey = presetFor(apiUrl, authMode);
  const [customUrl, setCustomUrl] = useState(activeKey === 'custom' ? apiUrl : '');
  const [customMode, setCustomMode] = useState<AuthMode>(authMode);

  const applyBackend = (urls: Record<string, string>, mode: AuthMode) => {
    const trimmed = Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, v.trim().replace(/\/$/, '')]));
    void useAuth.getState().setBackend(trimmed, mode);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <List.Subheader style={styles.subheader}>Backend</List.Subheader>
      {/* http presets need cleartext networking — dev-client-only (release builds block cleartext). */}
      {API_PRESETS.filter((p) => __DEV__ || p.urls.api.startsWith('https')).map((p) => (
        <List.Item
          key={p.key}
          onPress={() => applyBackend(p.urls, p.authMode)}
          title={p.label}
          description={`${Object.values(p.urls).join(' · ')} · ${p.authMode === 'oidc' ? 'sign-in' : 'dev bypass'}`}
          left={() => <RadioButton status={activeKey === p.key ? 'checked' : 'unchecked'} value={p.key} onPress={() => applyBackend(p.urls, p.authMode)} />}
        />
      ))}
      <View style={styles.custom}>
        <List.Item
          title="Custom"
          left={() => <RadioButton status={activeKey === 'custom' ? 'checked' : 'unchecked'} value="custom" />}
        />
        <Input
          label="http://host:5181"
          autoCapitalize="none"
          autoCorrect={false}
          value={customUrl}
          onChangeText={setCustomUrl}
        />
        <Button mode="text" compact onPress={() => setCustomMode(customMode === 'oidc' ? 'dev' : 'oidc')}>
          Auth: {customMode === 'oidc' ? 'sign-in' : 'dev bypass'} (tap to toggle)
        </Button>
        <Button
          mode="outlined"
          disabled={!customUrl.trim()}
          onPress={() => applyBackend({ api: customUrl }, customMode)}
        >
          Use custom backend
        </Button>
      </View>

      <List.Subheader style={styles.subheader}>Diagnostics</List.Subheader>
      {DIAGNOSTIC_ROUTES.map((d) => (
        <Button key={d.route} mode="text" compact onPress={() => navigation.navigate(d.route as never)}>
          {d.label}
        </Button>
      ))}

      <List.Subheader style={styles.subheader}>Sync state</List.Subheader>
      <Text style={[styles.mono, { color: c.textMuted }]}>{JSON.stringify(sync, null, 2)}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Inside a padded page a subheader's own 16dp inset would put headings right of the text they head.
  subheader: { paddingHorizontal: 0, paddingTop: spacing.md, paddingBottom: spacing.xs },
  container: { padding: spacing.lg, gap: spacing.sm },
  custom: { paddingVertical: spacing.sm, gap: spacing.sm },
  mono: { fontFamily: 'monospace', fontSize: 11 },
});
