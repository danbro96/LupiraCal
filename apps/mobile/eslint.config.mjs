import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** v7 entity-selector helper: `to('domain','data')` → [{ to: { element: { type: 'domain' } } }, …]. */
const to = (...types) => types.map((t) => ({ to: { element: { type: t } } }));

// A structural gate, not a style overhaul (mirrors the web client's config): the layered import boundary is
// downward-only — domain → nothing; data → domain; sync → data/domain; state → sync/…; ui → everything below.
// `generated` (orval output) is its own element importable from data/sync/state/ui; the shared
// @lupira/cal-domain package arrives as an external import, allowed everywhere (it is the bottom layer).
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
        { type: 'feedback', pattern: 'src/feedback/**' },
        { type: 'debug', pattern: 'src/debug/**' },
        { type: 'polyfills', pattern: 'src/polyfills/**' },
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
          { from: { element: { type: 'data' } }, allow: to('data', 'domain', 'generated', 'feedback', 'debug', 'config') },
          { from: { element: { type: 'sync' } }, allow: to('sync', 'data', 'domain', 'generated', 'feedback', 'debug', 'config') },
          { from: { element: { type: 'state' } }, allow: to('state', 'sync', 'data', 'domain', 'generated', 'feedback', 'debug', 'config') },
          { from: { element: { type: 'ui' } }, allow: to('ui', 'state', 'sync', 'data', 'domain', 'generated', 'feedback', 'debug', 'config') },
          { from: { element: { type: 'feedback' } }, allow: to('feedback') },
          { from: { element: { type: 'debug' } }, allow: to('debug') },
          { from: { element: { type: 'polyfills' } }, allow: to('polyfills') },
          { from: { element: { type: 'config' } }, allow: [] },
        ],
      }],
      ...reactHooks.configs['recommended-latest'].rules,
    },
  },
];
