import { AccountButton } from '@danbro96/lupira-expo-paper/components/AccountButton';
import { useAuth } from '../../state/auth-store';

export function AccountMenu() {
  const { authMode, user } = useAuth();
  const name = authMode === 'dev' ? 'Dev auto-auth' : user?.name ?? user?.sub ?? 'Signed out';
  return <AccountButton name={name} sub={user?.name ? user.sub : undefined} onSignOut={() => void useAuth.getState().clearSession()} />;
}
