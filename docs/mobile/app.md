# Mobile app (apps/mobile)

Shared Paper conventions: `~/Nextcloud/Familj/DevOps/Guides/frontend-estate.md`. Program tracker: [milestones.md](milestones.md). This file holds LupiraCal's specifics.

## UI stack specifics

- Paper is themed from tokens via `createPaperThemes` (`@danbro96/lupira-expo-paper`, called in `ui/theme/paperTheme.ts`; + adapted React Navigation themes); dark mode via `useColorScheme`.
- Two files may call Paper's `useTheme()` directly, each because it needs an MD3 slot the estate palette has no equivalent for: `SyncBanner` (errorContainer) and the settings index (elevation ramp).
- Feedback: `toast()` / `toastError()` from `@danbro96/lupira-expo-feedback` (host: the expo-paper `ToastHost`, Paper `Snackbar`); hold-to-copy (place tiles, reach rows) is its `copyText()`. `useUnsavedGuard` keeps `Alert.alert` (it fires inside `beforeRemove`).
- Text inputs use the `Input` wrapper in `ui/components/form.tsx` (Paper `TextInput`, outlined+dense, label prop; `Field` is only for non-text controls). It keeps a column-rhythm `marginTop` where the sibling apps' `TextField` carries a row-layout `flex: 1`.
- No hex literals except white text over calendar-coloured backgrounds.
- A place renders as `ui/components/PlaceTile` everywhere (name, address, meta line, `ui/map/MiniMap` thumbnail — a texture-mode, gesture-less `MapView`, so detail screens only, never lists — framed by place type via `@lupira/cal-domain/mapZoom`; tap → the Maps app at that point). Tags render as `TagRow` text, never chips.
- Detail screens carry no container padding: Paper rows and subheaders bring their own 16dp, other blocks take `spacing.lg`.
- Icons: `ui/icons.ts` maps concepts to `MaterialIcons`.
- Root navigator is `ui/navigation/RootStack.tsx`.

## Tabs, settings, calendar

- Tabs are Calendar/Contacts, each showing the native header. Settings is a pushed stack screen reached by `SettingsButton` in the tab navigator's `headerRight`: an index whose rows show each area's state (warning colour when it needs you) and open `CalendarSettings` / `AndroidSettings`. The map, photo library, GPS upload and camera-roll backup live in the sibling apps Lupira Maps and Lupira Photos; Cal opens them through `ui/openSibling` (`lupiramaps://`, `lupiraphotos://`, https fallback).
- Contacts' search sits in `ScreenToolbar` under the header.
- Calendar has no toolbar: the header title is the period (tap = date picker) and Search/Today/Month↔Week sit beside the cog (`useCalendarHeader`, via `setOptions`) — the grid needs the rows.
- `CalendarScreen` owns only anchor and jumps (the Month/Week mode is `prefs.calendarMode`); `MonthPane` (grid + `DaySheet`) and `WeekView` own their paging and selection.
- Every calendar gesture is RNGH + Reanimated: swipes, the day sheet's drag, and the week's pinch zoom (time axis, persisted as `prefs.weekHourHeight`), with the lanes' ScrollView joined via `Gesture.Native()`; a PanResponder loses that race to the native scroll.
- Both modes page with `usePager`: prev/current/next stay rendered (21 date-keyed columns / 3 month-keyed grids) on an axis fixed at mount, and a swipe only moves the axis, so the neighbour is live under the finger and a step re-renders nothing visible. Never reset the offset on a swipe; a `CalendarJump` (Today, picked date) is the one snap.
- Lanes are laid out in percent of the day so a zoom frame animates one height.
- Search (`ItemSearchScreen`) reads the mirror, not the API, so it works offline.

## Sync

`sync/pull.ts`: both `/sync/changes` cursors are opaque and scoped to the caller's readable containers — a grant/revoke answers `reset`, which makes the run a full sync. A full sync that never completed restarts (`getResumeCursor`): its prune needs every id. The container pull seeds a missing standard set (`@lupira/cal-domain/bootstrap`, shared with web). Non-network sync failures go to Sentry (`SENTRY_DSN` in `config/`, empty = off; user id = SHA-256 of the email).

`sync/outbox.ts` replays ops in `seq` order through `mirror.nextEligibleOp`: an op waits while an earlier op of the same aggregate is parked or still inside its backoff window, so a revise never overtakes a create that failed transiently. Other aggregates proceed; the held op is due once the earlier one succeeds, is retried (`retryOne`) or is discarded.

## Event editor

`ItemEditScreen`:

- A new event starts on the last-used calendars (`prefs.lastCalendarIds`) with you invited as going — your contact id is `me.contactId` in `mirror_meta`, refreshed by each sync from `/contact-api/me`; an `item.invite` op's `accept` ids get an RSVP right after the invite. Events you're not on offer Join (detail) and Add me (`PeopleSheet`).
- The place sheet is one list ranked by `@lupira/cal-domain/placeRank` (saved, hotspots decayed by last visit, typeahead `Place`s only, contacts' addresses by name; invited people's homes lead), each row saying who lives there (`residents` — current addresses only).
- Title, when, place, description up front; the rare fields are More rows opening `ui/event/*Sheet` (`ui/components/Sheet`).
- One Save = one `saveItem` enqueue: core revise + `item.file`/`item.unfile` + `item.invite`/`item.uninvite`. Participation has no section guard; each invite request carries a key derived from the op's command id + contact, and uninvite removes by contact — neither needs the participation id an offline invite doesn't have yet.
- Place = a geo `placeId` + label — cal-api 400s free-text `location` without one.
- Timed events carry `startTimezone` (the device's by default; the calendar bridge keeps an existing zone): the server repeats a zoned series on that zone's wall clock, so `@lupira/cal-domain/recurrence` does too. Parity fixtures come from LupiraCalApi `tools/FixtureEmitter` (a UTC UNTIL bounds the instant; a floating or date one, the wall clock).
