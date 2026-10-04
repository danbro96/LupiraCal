import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/** v7 entity-selector helper: `to('domain','data')` → [{ to: { element: { type: 'domain' } } }, …]. */
const to = (...types) => types.map((t) => ({ to: { element: { type: t } } }));

// A structural gate, not a style overhaul. The only real rule is the layered import boundary.
// Downward-only: data → config; state → data/config; ui → everything below. Domain logic lives in
// @lupira/cal-domain (packages/domain) and arrives as an external package import — allowed from
// every layer (it is the bottom of the stack); its purity is enforced by its own eslint config.
// The web has no offline `sync/` layer (it is online-only), so the chain is shorter than the app's.
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'src/data/api/**', // orval-generated client (from backend-openapi.json)
      'src/data/api-geo/**', // orval-generated client (from backend-geo-openapi.json)
      'src/data/api-contact/**', // orval-generated client (from backend-contact-openapi.json)
      'src/data/api-tasks/**', // orval-generated client (from backend-tasks-openapi.json)
      'src/data/api-location/**', // orval-generated client (from backend-location-openapi.json)
      'src/data/api-photo/**', // orval-generated client (from backend-photo-openapi.json)
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { boundaries, 'react-hooks': reactHooks },
    settings: {
      'boundaries/elements': [
        { type: 'data', pattern: 'src/data/**' },
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
          { from: { element: { type: 'data' } }, allow: to('data', 'config') },
          { from: { element: { type: 'state' } }, allow: to('state', 'data', 'config') },
          { from: { element: { type: 'ui' } }, allow: to('ui', 'state', 'data', 'config') },
          { from: { element: { type: 'config' } }, allow: [] },
        ],
      }],
      ...reactHooks.configs['recommended-latest'].rules,
    },
  },
];
