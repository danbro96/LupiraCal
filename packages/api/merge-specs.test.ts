import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = new URL('.', import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(join(here, p), 'utf8'));

const merged = read('../../openapi/LupiraCalBff.json');
const cal = read('../../src/LupiraCalBff/upstream/LupiraCalApi.json');
const tasks = read('../../src/LupiraCalBff/upstream/LupiraTasksApi.json');
const contact = read('../../src/LupiraCalBff/upstream/LupiraContactApi.json');

const schemas = merged.components.schemas as Record<string, unknown>;
const paths = Object.keys(merged.paths) as string[];

// A path is proxied iff its operations carry an upstream's tag, which the merge sets per cluster.
// The prefix cannot tell them apart any more: a BFF-declared endpoint also lives under /api/.
const UPSTREAM_TAGS = new Set(['cal', 'contact', 'geo', 'tasks', 'photo', 'comms']);
const isProxied = (path: string) =>
  Object.values(merged.paths[path] as Record<string, { tags?: string[] }>)
    .some((op) => (op?.tags ?? []).some((t) => UPSTREAM_TAGS.has(t)));
const exposed = read('../../src/LupiraCalBff/exposed.json').operations as Record<string, string[]>;

describe('the exposed allowlist', () => {
  it('is the whole of the merged surface — nothing rides along', () => {
    const allowed = new Set(
      Object.entries(exposed).flatMap(([cluster, ops]) =>
        ops.map((op) => {
          const [verb, path] = op.split(' ');
          const prefix = cluster === 'cal-api' ? '/api' : `/${cluster}`;
          return `${verb} ${prefix}${path}`;
        }),
      ),
    );
    const actual = Object.entries(merged.paths)
      .filter(([path]) => isProxied(path))
      .flatMap(([path, item]) =>
        Object.keys(item as object)
          .filter((verb) => verb !== 'parameters')
          .map((verb) => `${verb.toUpperCase()} ${path}`),
      );
    expect(actual.filter((op) => !allowed.has(op))).toEqual([]);
    expect(actual).toHaveLength(allowed.size);
  });

  it('publishes every uniform sync feed under its cluster mount', () => {
    expect(paths.filter((p) => /\/sync\/[a-z-]+$/.test(p) && !/\/sync\/(changes|containers)$/.test(p)).sort()).toEqual([
      '/api/sync/calendars',
      '/api/sync/items',
      '/contact-api/sync/address-books',
      '/contact-api/sync/contacts',
      '/contact-api/sync/groups',
      '/contact-api/sync/place-entries',
      '/contact-api/sync/relationships',
      '/contact-api/sync/residencies',
      '/tasks-api/sync/items',
      '/tasks-api/sync/lists',
    ]);
  });

  // These reach a different credential than the family session the BFF holds, or aren't a browser
  // surface at all. An allowlist should already exclude them; this fails loudly if one is re-added.
  it('never exposes ingest, share-links, the user directory or liveness probes', () => {
    // Anchored to the resource root: a list owner's own /lists/{id}/shares is session-auth'd and fine.
    const forbidden = /^\/[a-z-]+\/(pingz|ingest|shared|shares|users)(\/|$)/;
    expect(paths.filter((p) => forbidden.test(p))).toEqual([]);
  });
});

describe('merged BFF spec', () => {
  // Everything is either proxied under a cluster prefix or declared by the BFF itself. The second
  // kind is how an endpoint migrates off the proxy, so it must not be mistaken for a stray path.
  it('separates the paths the BFF declares itself from the proxied ones', () => {
    expect(paths.filter((p) => !isProxied(p)).sort()).toEqual([
      '/api/contacts/{id}/context',
      '/auth/user',
    ]);
    // Every proxied path still sits under its cluster's mount.
    const prefixes = ['/api/', '/contact-api/', '/geo-api/', '/tasks-api/', '/photo-api/', '/comms-api/'];
    expect(paths.filter(isProxied).filter((p) => !prefixes.some((x) => p.startsWith(x)))).toEqual([]);
  });

  // /items and /sync/* existed in 2 specs each and generated the same query key; prefixing makes
  // them distinct, which is what removes the collision class.
  it('gives every previously-colliding route a distinct path', () => {
    expect(new Set(paths).size).toBe(paths.length);
    for (const tail of ['/items', '/sync/changes', '/sync/containers', '/sync/items']) {
      expect(paths.filter((p) => p.endsWith(tail)).length).toBeGreaterThan(1);
    }
  });

  // Same name, different enum values — a merge that picked one would still typecheck. Compared
  // without the JSON-null member: Microsoft.OpenApi's reader drops it, and it carries nothing —
  // nullability is on the property (`oneOf: [{type: null}, {$ref}]`), so the client is unchanged.
  const members = (schema: unknown) =>
    ((schema as { enum: (string | null)[] }).enum ?? []).filter((v) => v !== null);

  it('keeps cal and tasks ItemStatus apart, each matching its source', () => {
    expect(members(schemas.ItemStatus)).toEqual(members(cal.components.schemas.ItemStatus));
    expect(members(schemas.TasksItemStatus)).toEqual(members(tasks.components.schemas.ItemStatus));
    expect(members(cal.components.schemas.ItemStatus))
      .not.toEqual(members(tasks.components.schemas.ItemStatus));
  });

  it('namespaces the cal/contact conflicts against their source', () => {
    const RENAMED = ['OwnerGrantDto', 'SectionGuardsDto'];
    // A renamed schema's siblings must point at the new name, so compare the source with the same
    // rewrite applied — otherwise this asserts the refs were left dangling.
    const rewrite = (v: unknown) =>
      JSON.parse(RENAMED.reduce(
        (s, n) => s.replaceAll(`"#/components/schemas/${n}"`, `"#/components/schemas/Contact${n}"`),
        JSON.stringify(v),
      ));
    for (const name of RENAMED) {
      expect(schemas[name]).toEqual(cal.components.schemas[name]);
      expect(schemas[`Contact${name}`]).toEqual(rewrite(contact.components.schemas[name]));
    }
  });

  it('keeps cal and tasks sync item pages apart, each matching its source', () => {
    expect(schemas.SyncPageOfItemSyncChange).toEqual(cal.components.schemas.SyncPageOfItemSyncChange);
    expect(schemas.ItemSyncChange).toEqual(cal.components.schemas.ItemSyncChange);
    expect(schemas.TasksItemSyncChange).toEqual(tasks.components.schemas.ItemSyncChange);
    expect((schemas.TasksSyncPageOfItemSyncChange as { properties: { changed: unknown } }).properties.changed)
      .toEqual({ type: 'array', items: { $ref: '#/components/schemas/TasksItemSyncChange' } });
  });

  it('drops every /me but contact’s, which alone carries contactId', () => {
    expect(paths.filter((p) => p.endsWith('/me'))).toEqual(['/contact-api/me']);
    expect(Object.keys(schemas).filter((n) => n.includes('MeDto'))).toEqual(['MeDto']);
    expect(schemas.MeDto).toEqual(contact.components.schemas.MeDto);
  });

  // Operation ids name the generated functions and their inline param types. cal and tasks both
  // declared GetItem/UpdateItem for different operations, which produced a duplicate TS identifier.
  it('has no duplicate operationIds', () => {
    const ids = Object.values(merged.paths as Record<string, Record<string, { operationId?: string }>>)
      .flatMap((item) => Object.values(item).map((op) => op?.operationId).filter(Boolean));
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('leaves no schema unreachable from a path', () => {
    const refs = new Set<string>();
    JSON.stringify(merged).replace(/"#\/components\/schemas\/([^"]+)"/g, (_m, n: string) => (refs.add(n), _m));
    expect(Object.keys(schemas).filter((n) => !refs.has(n))).toEqual([]);
  });
});
