import { pure } from '@danbro96/lupira-config-eslint';

// geojson ships types only, so `import type` from it erases entirely.
export default pure({ element: 'domain', allowModules: ['geojson', 'fractional-indexing', '@danbro96/lupira-domain-*'], tsconfigRootDir: import.meta.dirname });
