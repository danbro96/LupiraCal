# Mobile app (apps/mobile)

Shared Paper conventions: `~/Nextcloud/Familj/DevOps/Guides/frontend-estate.md`. Program tracker: [milestones.md](milestones.md). This file holds LupiraCal's specifics.

## UI stack specifics

- Paper is themed from tokens via `createPaperThemes` (`@danbro96/lupira-expo-paper`, called in `ui/theme/paperTheme.ts`; + adapted React Navigation themes); dark mode via `useColorScheme`.
- Two files may call Paper's `useTheme()` directly, each because it needs an MD3 slot the estate palette has no equivalent for: `SyncBanner` (errorContainer) and the settings index (elevation ramp).
- Feedback: `toast()` / `toastError()` from `@danbro96/lupira-expo-feedback` (host: the expo-paper `ToastHost`, Paper `Snackbar`); hold-to-copy (place tiles, reach rows) is its `copyText()`. `useUnsavedGuard` keeps `Alert.alert` (it fires inside `beforeRemove`).
- Text inputs use the expo-paper `TextField` (label prop, `fieldGap` between stacked fields); `ui/components/Field` wraps only non-text controls.
- No hex literals except white text over calendar-coloured backgrounds.
- A place renders as `ui/components/PlaceTile` everywhere (name, address, meta line, `ui/map/MiniMap` thumbnail — a texture-mode, gesture-less `MapView`, so detail screens only, never lists — framed by place type via `@danbro96/lupira-domain-maps/mapZoom`; tap → the Maps app at that point). Tags render as `TagRow` text, never chips.
- Detail screens carry no container padding: Paper rows and subheaders bring their own 16dp, other blocks take `spacing.lg`.
- Icons: `ui/icons.ts` maps concepts to `MaterialIcons`.
- Root navigator is `ui/navigation/RootStack.tsx`.

## Tabs, settings, calendar

- Tabs are Calendar/Contacts, each showing the native header. Settings is a pushed stack screen reached from the `AccountButton` avatar (it opens Settings; sign-out is in Settings' Account section) in the tab navigator's `headerRight`: sections whose rows show each area's state (warning colour when it needs you) and open `CalendarSettings` / `AndroidSettings`. The map, photo library, GPS upload and camera-roll backup live in the sibling apps Lupira Maps and Lupira Photos; Cal opens them through `ui/openSibling` (`lupiramaps://`, `lupiraphotos://`, https fallback).
- Contacts' search sits in `ScreenToolbar` under the header.
- Calendar has no toolbar: the header title is the period (tap = date picker) and Search plus an overflow menu (Today, Month↔Week) sit beside the avatar (`useCalendarHeader`, via `setOptions`) — the grid needs the rows.
- `CalendarScreen` owns only anchor and jumps (the Month/Week mode is `prefs.calendarMode`); `MonthPane` (grid + `DaySheet`) and `WeekView` own their paging and selection.
- Every calendar gesture is RNGH + Reanimated: swipes, the day sheet's drag, and the week's pinch zoom (time axis, persisted as `prefs.weekHourHeight`), with the lanes' ScrollView joined via `Gesture.Native()`; a PanResponder loses that race to the native scroll.
- Both modes page with `usePager`: prev/current/next stay rendered (21 date-keyed columns / 3 month-keyed grids) on an axis fixed at mount, and a swipe only moves the axis, so the neighbour is live under the finger and a step re-renders nothing visible. Never reset the offset on a swipe; a `CalendarJump` (Today, picked date) is the one snap.
- Lanes are laid out in percent of the day so a zoom frame animates one height.
- Search (`ItemSearchScreen`) reads the mirror, not the API, so it works offline.

## Sync

The offline kernel is `@danbro96/lupira-sync-engine` over `lupira-calendar.db` (`data/db/expoDb.ts`; the pre-kernel `lupira-calendar-mirror.db` is deleted on first open). `sync/engine.ts` wires one module per aggregate (`sync/modules/`), pulled in this order:

| Module | Feed | Writes | Index tables |
|---|---|---|---|
| `cal.calendar` | `/api/sync/calendars` (snapshot; seeds a missing standard set) | — | `calendar_index`, view `bridge_calendars` |
| `contact.addressBook` | `/contact-api/sync/address-books` (snapshot; seeds) | — | — |
| `contact.group` | `/contact-api/sync/groups` (snapshot) | — | — |
| `cal.item` | `/api/sync/items` | `item.*` ops | `item_index`, `item_calendars`, `item_occurrences`, view `bridge_items` |
| `contact` | `/contact-api/sync/contacts` | `contact.*` ops | `contact_index`, `birthday_occurrences`, view `bridge_contacts` |
| `contact.relationship` | `/contact-api/sync/relationships` | — | `relationship_index` |
| `contact.residency` | `/contact-api/sync/residencies` | — | `residency_index` |
| `contact.placeEntry` | `/contact-api/sync/place-entries` (doc id = place id) | — | — |
| `tasks.list` | `/tasks-api/sync/lists` | — | — |
| `tasks.item` | `/tasks-api/sync/items` | — (edits live in Lupira Tasks) | `task_deadlines` (open deadlines) |
| `contact.me` | `/contact-api/me` (one-doc snapshot) | — | — |

- Every change to an input (pulled doc, queued op, discard, ack) recomputes `local = reduce(server, ...ops)` with `domain/mirrorReducers` and rewrites the module's index rows; a deleted doc is `null`. Table DDL and row writers live in `data/indexes/`, the reads over them in `data/queries/`.
- Ops (`domain/ops.ts`) carry `aggregate`/`aggregateId` from `stamp()`; `state/actions.ts` is the write surface, `sync/replayOp.ts` the REST replay (`Idempotency-Key: commandId`). Ops of one aggregate replay in order; a parked or backed-off op holds the ones behind it.
- Occurrences are materialized over a rolling horizon (`domain/materialize`); `sync/horizon.ts` keeps it in kernel meta and reindexes `cal.item` and `contact` when it drifts a month.
- Prefs and bridge flags are kernel meta keys (`sync/meta.ts`). Signing in as a different account wipes the engine and the query cache (`state/auth-store.ts`, `onAccountChange`).
- Triggers: `startSyncTriggers` (foreground, reconnect, sign-in) from `App.tsx`; the 15-minute background task is defined in `index.ts` and loads the auth session first. The Android bridge drains its inbox before each push and republishes after each pull (`hooks`).
- The banner, Settings and `SyncIssuesScreen` read the kernel's status store (`state/useSyncStatus`), `bannerState` and `parked()`/`retry`/`discard`. Non-network sync failures go to Sentry (`SENTRY_DSN` in `config/`, empty = off; user id = SHA-256 of the email).
- `MirrorReader.kt` reads only the `bridge_*` views (`id`, `display_name` for contacts, `state` = the stored `{doc, guards}` JSON); `sync/modules/bridgeViews.test.ts` pins that contract.

## Event editor

`ItemEditScreen`:

- A new event starts on the last-used calendars (`prefs.lastCalendarIds`) with you invited as going — your contact id comes from the mirrored `/contact-api/me` doc (`contact.me`); an `item.invite` op's `accept` ids get an RSVP right after the invite. Events you're not on offer Join (detail) and Add me (`PeopleSheet`).
- The place sheet is one list ranked by `@danbro96/lupira-domain-places/placeRank` (saved, hotspots decayed by last visit, typeahead `Place`s only, contacts' addresses by name; invited people's homes lead), each row saying who lives there (`residents` — current addresses only).
- Title, when, place, description up front; the rare fields are More rows opening `ui/event/*Sheet` (`ui/components/Sheet`).
- One Save = one `saveItem` enqueue: core revise + `item.file`/`item.unfile` + `item.invite`/`item.uninvite`. Participation has no section guard; each invite request carries a key derived from the op's command id + contact, and uninvite removes by contact — neither needs the participation id an offline invite doesn't have yet.
- Place = a geo `placeId` + label — cal-api 400s free-text `location` without one.
- Timed events carry `startTimezone` (the device's by default; the calendar bridge keeps an existing zone): the server repeats a zoned series on that zone's wall clock, so `@lupira/cal-domain/recurrence` does too. Parity fixtures come from LupiraCalApi `tools/FixtureEmitter` (a UTC UNTIL bounds the instant; a floating or date one, the wall clock).
