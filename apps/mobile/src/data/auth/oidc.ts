import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';
import { createOidcClient } from '@danbro96/lupira-expo-oidc/oidc';
import { REQUEST_TIMEOUT_MS } from '../../config';
import { OIDC_CLIENT_ID, OIDC_ISSUER } from './oidcConfig';

export const oidc = createOidcClient({ issuer: OIDC_ISSUER, clientId: OIDC_CLIENT_ID, timeoutMs: REQUEST_TIMEOUT_MS, log: logDebug });
