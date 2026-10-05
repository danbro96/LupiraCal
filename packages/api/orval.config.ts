import { defineConfig } from 'orval';

// One spec — the merged BFF surface — in two flavours, because the split is per call site, not per
// app. `query` is for anything read straight off the server; `fetch` is for callers that own their
// own caching: the mobile sync engine (cal + contact are mirrored into SQLite and rebase offline
// edits) and the event photo strip. Both go through src/transport.ts (`@danbro96/lupira-http`'s
// seam), which each app fills in.
//
// Models are generated once, by the query target, and the fetch target points at the same directory
// so there is a single set of types. `clean` is deliberately off — it would let whichever target
// runs second delete the other's output.

const input = { target: '../../openapi/LupiraCalBff.json' } as const;
const mutator = { path: './src/transport.ts', name: 'apiRequest' } as const;

export default defineConfig({
  query: {
    input,
    output: {
      target: './src/generated/query/client.ts',
      schemas: './src/generated/models',
      client: 'react-query',
      httpClient: 'fetch',
      mode: 'tags-split',
      clean: false,
      override: { mutator, fetch: { includeHttpResponseReturnType: false } },
    },
  },
  fetch: {
    input,
    output: {
      target: './src/generated/fetch/client.ts',
      schemas: './src/generated/models',
      client: 'fetch',
      mode: 'tags-split',
      clean: false,
      override: { mutator, fetch: { includeHttpResponseReturnType: false } },
    },
  },
});
