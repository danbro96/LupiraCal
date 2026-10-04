import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** v7 entity-selector helper: `to('domain','data')` → [{ to: { element: { type: 'domain' } } }, …]. */
const to = (...types) => types.map((t) => ({ to: { element: { type: t } } }));
const platform = (source, internalPath) => ({ to: { module: { origin: 'external', source, ...(internalPath && { internalPath }) } } });
const fromEach = (types, allow) => types.map((t) => ({ from: { element: { type: t } }, allow }));
const DATA_UP = ['data', 'sync', 'state', 'ui'];

// A structural gate, not a style overhaul (mirrors the web client's config): the layered import boundary is
// downward-only — domain → nothing; data → domain; sync → data/domain; state → sync/…; ui → everything below.
// `generated` (orval output) is its own element importable from data/sync/state/ui; the shared
// @lupira/cal-domain package arrives as an external import, allowed everywhere (it is the bottom layer).
// LupiraPlatform (@danbro96) packages sit at the layer their name declares: tokens/domain (and the pure sync-core) everywhere,
// http from data up (domain may name its ApiError), the feedback/debug/oidc/sqlite leaves from data up,
// the Paper kit and diagnostics screens from ui only.
export default [
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'android/**',
      'dist/**',
      'src/data/api/generated/**',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx', 'index.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { boundaries, 'react-hooks': reactHooks },
    settings: {
      'boundaries/elements': [
        { type: 'generated', pattern: 'src/data/api/generated/**' },
        { type: 'domain', pattern: 'src/domain/**' },
        { type: 'data', pattern: 'src/data/**' },
        { type: 'sync', pattern: 'src/sync/**' },
        { type: 'state', pattern: 'src/state/**' },
        { type: 'ui', pattern: 'src/ui/**' },
        { type: 'config', pattern: 'src/config' },
      ],
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        policies: [
          { from: { element: { type: 'generated' } }, allow: to('generated', 'data') },
          { from: { element: { type: 'domain' } }, allow: to('domain') },
          { from: { element: { type: 'data' } }, allow: to('data', 'domain', 'generated', 'config') },
          { from: { element: { type: 'sync' } }, allow: to('sync', 'data', 'domain', 'generated', 'config') },
          { from: { element: { type: 'state' } }, allow: to('state', 'sync', 'data', 'domain', 'generated', 'config') },
          { from: { element: { type: 'ui' } }, allow: to('ui', 'state', 'sync', 'data', 'domain', 'generated', 'config') },
          { from: { element: { type: 'config' } }, allow: [] },
          { allow: [{ to: { module: { origin: ['external', 'core'] } } }] },
          { disallow: [platform('@danbro96/*')] },
          { allow: [platform(['@danbro96/lupira-tokens-*', '@danbro96/lupira-domain-*', '@danbro96/lupira-sync-core'])] },
          { from: { element: { type: 'domain' } }, allow: [platform('@danbro96/lupira-http', 'apiError')] },
          ...fromEach(DATA_UP, [
            platform('@danbro96/lupira-http'),
            platform('@danbro96/lupira-expo-feedback'),
            platform('@danbro96/lupira-expo-diagnostics', 'log'),
            platform('@danbro96/lupira-expo-oidc', ['oidc', 'tokenSession']),
            platform('@danbro96/lupira-expo-sqlite'),
          ]),
          { from: { element: { type: 'ui' } }, allow: [platform(['@danbro96/lupira-expo-paper', '@danbro96/lupira-expo-diagnostics'])] },
        ],
        checkAllOrigins: true,
      }],
      ...reactHooks.configs['recommended-latest'].rules,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx', 'index.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: '@danbro96/lupira-expo-sqlite/node', message: 'node:sqlite is for tests; Metro cannot bundle it.' }] }],
    },
  },
];
