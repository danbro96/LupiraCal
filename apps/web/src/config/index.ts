/**
 * The BFF serves every upstream same-origin under its own route prefix, and those prefixes now live
 * in the merged spec (`packages/api`), so the generated clients carry them in the path and nothing
 * here feeds a mutator any more. The BFF's allowlist in `src/LupiraCalBff/exposed.json` is the
 * single source for them.
 *
 * What is left is the basemap, which is not part of any OpenAPI surface: geo-api serves the style,
 * sprite, glyphs and pmtiles as static assets, and `@danbro96/lupira-web-maplibre/mapStyle` fetches
 * them by hand.
 */
const rawGeo = import.meta.env.VITE_GEO_API_BASE_URL as string | undefined;
export const GEO_API_BASE_URL = (rawGeo ?? '/geo-api').replace(/\/$/, '');
