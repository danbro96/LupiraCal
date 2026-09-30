import { TransformRequestManager } from '@maplibre/maplibre-react-native';
import { useEffect } from 'react';
import { useAuth } from '../../state/auth-store';

const AUTH_HEADER_ID = 'lupira-auth';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The native map fetches style assets (tiles/glyphs/sprite) itself, outside the mutator — the bearer
 *  rides a TransformRequestManager header scoped to the BFF origin. Scoping matters: presigned or
 *  third-party URLs must never receive an Authorization header. Re-adding the same id updates in place,
 *  which is what makes token rotation safe mid-session. */
export function useMapAuthHeader() {
  const token = useAuth((s) => s.token);
  const apiUrl = useAuth((s) => s.apiUrl);
  useEffect(() => {
    if (!token) {
      TransformRequestManager.removeHeader(AUTH_HEADER_ID);
      return;
    }
    TransformRequestManager.addHeader({
      id: AUTH_HEADER_ID,
      name: 'Authorization',
      value: `Bearer ${token}`,
      match: `^${escapeRegex(apiUrl.replace(/\/$/, ''))}/`,
    });
  }, [token, apiUrl]);
}
