import { DeveloperScreen as DiagnosticsScreen } from '@danbro96/lupira-expo-diagnostics/DeveloperScreen';
import { API_PRESETS, DIAGNOSTIC_ROUTES } from '../../config';
import { useAuth } from '../../state/auth-store';
import { useSyncStatus } from '../../state/useSyncStatus';
import { toastError } from '@danbro96/lupira-expo-feedback/toast';

/** Reachable from Settings and from the login screen (switching backends must not require signing in first). */
export function DeveloperScreen() {
  const { apiUrl, authMode } = useAuth();
  const sync = useSyncStatus();
  return (
    <DiagnosticsScreen
      presets={API_PRESETS}
      diagnosticRoutes={DIAGNOSTIC_ROUTES}
      apiUrl={apiUrl}
      authMode={authMode}
      onSelectBackend={(urls, mode) => void useAuth.getState().setBackend(urls, mode).catch(() => toastError('Could not switch the backend.'))}
      customUrlPlaceholder="http://host:5181"
      syncState={sync}
    />
  );
}
