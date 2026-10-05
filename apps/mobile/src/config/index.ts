import type { AppHosts } from '@danbro96/lupira-domain-links/appLinks';


export const REQUEST_TIMEOUT_MS = 10_000;

/** 'dev' = this backend's bypass; here that means sending nothing (the BFF's DevAuthHandler). */
export type AuthMode = 'oidc' | 'dev';

/** `urls.api` is the primary origin; multi-backend apps add keys. */
export type ApiPreset = {
  key: string;
  label: string;
  urls: { api: string } & Record<string, string>;
  authMode: AuthMode;
};

export const API_PRESETS: ApiPreset[] = [
  { key: 'prod', label: 'Production', urls: { api: 'https://cal.lupira.com' }, authMode: 'oidc' },
  { key: 'lan', label: 'LAN dev', urls: { api: 'http://192.168.14.108:5181' }, authMode: 'dev' },
  { key: 'emulator', label: 'Emulator dev', urls: { api: 'http://10.0.2.2:5181' }, authMode: 'dev' },
];

// Build-time default; the settings screen persists a runtime override on top.
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? API_PRESETS[0].urls.api;
export const DEFAULT_AUTH_MODE: AuthMode =
  (process.env.EXPO_PUBLIC_AUTH_MODE as AuthMode | undefined)
  ?? (process.env.EXPO_PUBLIC_API_URL ? 'dev' : 'oidc');

// Sentry DSN — a public ingest key, safe to commit. Empty disables reporting.
export const SENTRY_DSN = 'https://019f2e77341261c4fcfb2f27cda338e1@o4511341575733248.ingest.de.sentry.io/4512180961345616';

export const SIBLING_WEB_HOSTS: AppHosts = {
  cal: 'https://cal.lupira.com',
  maps: 'https://maps.lupira.com',
  photos: 'https://photos.lupira.com',
  tasks: 'https://tasks.lupira.com',
};

/** Extra screens the Developer screen links to. */
export const DIAGNOSTIC_ROUTES: { route: string; label: string }[] = [
  { route: 'DebugLog', label: 'Debug log' },
  { route: 'BridgeDiagnostics', label: 'Bridge diagnostics' },
];
