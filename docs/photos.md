# Photos in Cal

The photo library, trash, upload and camera-roll backup live in Lupira Photos (photos.lupira.com, repo LupiraPhotos). Cal keeps the **event photo strip**: the photos linked to an event, shown in the item drawer (web `drawer/ItemPhotosPanel`) and the event detail screen (mobile `ui/photos/EventPhotosRow`).

## Photo-event links

Photo↔event links are cal-api `Relation`s with `toKind: 'photo'` (`GET /relations/edges?toKind=photo`). The strip lists them via photo-api `POST /photos/lookup`, and offers the photos taken while the event was happening (window: `@danbro96/lupira-domain-photos/photoWindow`, the same set Photos suggests). Linking a suggested photo is always confirmed, never automatic (`POST /items/{id}/relations`).

A thumbnail and "See all" open Lupira Photos on the event (`photosEventUrl`; mobile `lupiraphotos://event/{id}` with the https fallback).

## Images

Presigned URLs rotate their signature, so the mobile image cache keys on the asset id (`ui/photos/imageCache`); `staleTime` stays inside the 24 h thumb expiry. HEIC originals are served untranscoded and fall back to the thumbnail.
