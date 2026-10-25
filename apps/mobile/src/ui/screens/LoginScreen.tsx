import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';
import { useOidcLogin } from '@danbro96/lupira-expo-oidc/useOidcLogin';
import { oidc } from '../../data/auth/oidc';
import { OIDC_REDIRECT_PATH, OIDC_SCHEME, OIDC_SCOPES } from '../../data/auth/oidcConfig';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { useAuth } from '../../state/auth-store';
import type { RootStackParamList } from '../navigation/types';
import { useColors, spacing } from '../theme';

WebBrowser.maybeCompleteAuthSession();

export function LoginScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Login'>) {
  const c = useColors();
  const { status, error, retry, signIn } = useOidcLogin({
    oidc,
    scopes: OIDC_SCOPES,
    scheme: OIDC_SCHEME,
    path: OIDC_REDIRECT_PATH,
    onTokens: (tokens) => useAuth.getState().setSession(tokens),
    log: logDebug,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lupira Calendar</Text>
      {status === 'ready' ? (
        <Button mode="contained" onPress={() => void signIn().catch(() => toastError('Sign-in failed.'))}>
          Sign in with Lupira
        </Button>
      ) : status === 'unavailable' ? (
        <Button mode="outlined" onPress={retry}>
          Retry
        </Button>
      ) : (
        <ActivityIndicator />
      )}
      {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
      <Button mode="text" compact onPress={() => navigation.navigate('Developer')}>
          Backend settings
        </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  title: { fontSize: 24, fontWeight: '600' },
  error: { textAlign: 'center' },
});
