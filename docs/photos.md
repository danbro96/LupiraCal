# Photos

Web `/photos` (reached from BottomNav's More) and the mobile Photos tab.

## Listing and filters

- Day-grouped, cursor-paged grid over `/photo-api/photos`. Sort is `TakenAtDesc`/`TakenAtAsc` (the cursor encodes its direction and the server rejects a mismatch). Filters: kind/located/place/status/event, plus `trashed` for the trash view.
- `GET /photos/stats` feeds the year/month timeline (a pick filters to that span rather than scrolling — an unloaded month would mean paging through everything since) and the failed chip. `POST /photos/lookup` hydrates relation ids in one call.
- The event filter resolves client-side (edges → lookup → `@lupira/cal-domain/photoFilter`), never by paging the list.
- Search is one box (web `PhotoSearch`, mobile `PhotoSearchSheet`): dates from the stats timeline (`matchTimeline`), events from cal `searchItems`, places from `GET /photos/places`; free text filters by place.
- Day headers carry the day's top places and linked events (`topPlaces` / `linkedEventIds`), each a filter.

## Selection, linking, trash

- Both grids multi-select for bulk link/unlink/trash. One event picker (`LinkEventDialog` / `LinkEventSheet`, window `captureWindow`) serves a single photo and a selection. Links go through `POST /items/{id}/relations/batch[/delete]`, so an Undo is one call.
- **Delete means trash**: `POST /photos/{id}/trash` offers Undo (restore) instead of a confirm. Only "Delete for good" and "Empty trash" confirm, and the server purges after `purgesAt`.
- Web Undo actions are plain fetchers (`usePhotoActions`), not mutation hooks — the snackbar outlives the component that offered it.

## Photo-event links

Photo↔event links are cal-api `Relation`s with `toKind: 'photo'` (`GET /relations/edges?toKind=photo` returns the whole map in one call). Candidates come from items around `takenAt` and are always confirmed, never auto-linked. The window is `@lupira/cal-domain/photoWindow` so both clients suggest the same set; the item drawer/detail screen offers the photos taken while an event was happening.

## Images and caching

- **Presigned URLs rotate their signature**, so mobile image caches key on the asset id via `source.cacheKey` (`ui/photos/imageCache` — `recyclingKey` only resets recycled views, it is not a cache key). photo-api reuses each signed URL for half its life so the browser cache hits too, and `staleTime` stays well inside the 24 h thumb expiry.
- The newest unfiltered page is kept in `mirror_meta` (`data/photoSnapshot`) so an offline launch still has a grid.
- `originalUrl` is single-asset-only and short-lived, so the viewer fetches it for the page in view alone.
- HEIC originals are served untranscoded — neither client can decode them, both fall back to the thumbnail.
- The mobile viewer's Save goes through `saveOriginalToPhone`, which files the copy as already uploaded in `photo_upload_queue` — it is a new MediaStore asset with a fresh creation time, so the next scan would otherwise upload it again.

## Duplicates

Detected server-side, twice: a surrogate `(takenAt, sizeBytes, contentType)` match at declare returns `Status: Duplicate` with no upload URL (so a second phone never transfers the bytes), and the worker hashes the original it already streams for the thumbnail and marks late duplicates, deleting their objects. A duplicate owns no bytes, points at the canonical via `duplicateOfId`, is excluded from listings unless `status=Duplicate` is asked for by name, and is deleted along with its canonical — it can never be promoted.

## Map cross-links

Ride URL/route params: `/locations?at=<lon>,<lat>` (mobile: the Map tab's `at`) flies to a photo, and `?from=&to=` day bounds (YMD, the map's own vocabulary) filter the gallery to a pin's day. The map's photo layer is clustered server-side; see [map.md](map.md).
