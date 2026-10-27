# Web UI (apps/web)

Shared MUI conventions: `~/Nextcloud/Familj/DevOps/Guides/frontend-estate.md`. This file holds LupiraCal's specifics.

## Stack specifics

- Theme = `createLupiraMuiTheme` from `@danbro96/lupira-web-mui` (CSS-variable color schemes, `colorSchemeSelector: 'media'`) fed from tokens, plus Cal's category vars (teal primary), system-driven dark. Breakpoint `md: 821` is the phone breakpoint (`useIsPhone` wraps `useMediaQuery`).
- Palette (incl. custom `border`, `text.subtle`, `warning`/`success`) emits `--mui-palette-*`; the domain relation accents emit as `--cat-*` via `MuiCssBaseline` styleOverrides, sourced from `@lupira/cal-tokens/contactCategories`.
- No bespoke stylesheet. `index.css` is 31 lines: Tailwind's two entry points, an `@theme inline` that re-exports `--cat-*` as `cat-*` utilities, and three element resets. Tailwind 4 serves utilities on non-MUI elements and vendor DOM reachable only with an arbitrary variant.
- One `className` hook is deliberate and load-bearing: `.contact-row` (so the pin reveals on row hover).
- Vendor stylesheets (maplibre, xyflow) are unlayered and outrank every layer: overriding their rules needs `!`.
- Shared layout primitives in `ui/components/`: `WrapRow`, `DrawerSection`, `Page`/`PageHead`, `Row`/`RowName`, `panes.tsx`.
- Forms = react-hook-form (`Controller`-wrapped MUI fields). `ContactEditForm` gates its 8-endpoint fan-out by payload comparison, not `dirtyFields`.
- Mutation errors → `useSnackbar()` (`@danbro96/lupira-web-mui` SnackbarHost); field validation stays inline.
- Detail cards share `drawer/DetailDrawer.tsx`.
- Place picking: see [Places](#places).
- A place renders as `places/PlaceTile` (name, one-line address, meta, a lazy `@danbro96/lupira-web-maplibre` `MiniMap` thumbnail framed by `@danbro96/lupira-domain-maps/mapZoom`, copy button via `useCopy`, optional change and clear actions).
- Per-browser conveniences (last calendar, calendar view per layout) live in `state/localPrefs`, behind the URL.
- Build splits a `vendor-mui` chunk (rolldown `advancedChunks`).
- Icons: `@danbro96/lupira-web-mui/icons` re-exports `@mui/icons-material` `*Outlined`; `ui/icons.ts` holds only Cal's extras. `packages/tokens/src/icons.ts` names concepts, not glyphs, so it stays dependency-free; `ICON_BY_NAME` in `ui/theme/kinds.ts` is `Record<IconName, SvgIconComponent>`, making an unmapped concept a compile error. `SavedPlaceDto.icon` is geo-api data, rendered verbatim.
- Maps and photos are separate apps (maps.lupira.com, photos.lupira.com). Cal links out through `config/siblings.ts` + `@danbro96/lupira-domain-links`; the BFF 301s `/locations`, `/photos` and `/places` there. Lazy routes keep `export default` because `React.lazy` needs one; the filename still matches the symbol. `ContactsLayout` lives in `ui/navigation/` — routing structure, not a screen.

## Places

A form's place is a `PlaceSelection` from `@lupira/cal-domain/placeSelection` (a stored place id with its label), never typed text, so nothing unresolved can be saved. The rules (prediction policy, omnibox sections, search machine, address drafts) live in `@lupira/cal-domain`; web keeps the adapters.

- **State.** `usePlaceSources(ctx)` gathers what is known for a `PlaceContext`: `GET /place-usage` (10 min stale), residencies, your own home, household homes (`householdHomes` over contact relations), saved places and hotspots over the last 24 months (`hotspotWindowFrom`), all named and located by one `/places/lookup`. An event without an origin is placed by its day's other events, else your home. `usePlacePredictions` runs `predictPlaces` over it (someone else's home's visits count by the event kind's `homeHistory`: full for meals and occasions, half or less for everyday kinds); `usePlaceOmnibox` drives `placeSearchMachine` and `omniboxSections` (typeahead `GET /geocode/forward?intent=Typeahead`, debounced, biased to the origin; "your places" is a local `pickPlaces` match). `useAddressLookup` is the structured typeahead behind an address draft, `usePinSuggestion` names a pin by `GET /geocode/reverse?precision=Building`. `useResolveGeocodeHit` (`POST /places/from-geocode` with the hit's OSM id, coordinates and address parts) and `usePinPlace` (`POST /places/from-pin`) both return a `PlaceSelection`.
- **Events** (`ItemDrawer` "Where", `NewItemModal`): `places/PlaceField` shows the tile once chosen, else a search field (`PLACE_SEARCH_PROMPT`; clicking or typing opens the search, seeded with the typed key; its map icon opens "Pick on map") over the top `PREDICTION_CHIPS` predicted chips (why each is offered in its tooltip). The search is `PlaceSearchDialog` (full-screen on phones): predictions, homes, saved and frequent before typing; your places, addresses and the pin row while typing. An imported item's free-text location shows as a hint and seeds the search.
- **Pins.** `PinPlaceDialog` is one dialog: the shared `MapPinDialog` with a name field above the map, prefilled from the address under the pin (`onPinChange` → `usePinSuggestion`) until you type one. An event's pin needs a name; a contact's may stay unnamed and the server names it after its address. "Adjust pin" opens it on the place's point (`initialPin`).
- **Addresses** (`ContactEditForm` residency rows, `MoveDialog`): `places/AddressForm` takes street (with suggestions), postcode (written in its country's form), city and country (your home's, else Sweden); or "Same as …" a household member's home, "Use existing place" (predictions add recent addresses: the places most recently moved into across your contacts, `recentResidencies`), or "Pick on map". Resolved, it shows the tile with "Adjust pin". Each row reports `empty | drafting | resolved`; `residencySaveError` blocks Save while one is half-typed.

## Calendar visibility and writability

`@lupira/cal-domain/calendars`: Agenda calendars start shown, System hidden; a per-calendar choice overrides.

- Web: `CalendarToggles` (side panel on desktop, sheet on phones; only the calendar screen renders it), remembered in `localPrefs`.
- Mobile: Settings → Calendar, `prefs.calendarChoices`, applied by `useCalendarFilter` to the grids and search (Birthdays hides synthesized birthdays).
- Every filing picker offers only `canWriteCalendar` (Owner/ReadWrite) calendars.

## Grids

Hand-rolled (no calendar lib). `GET /items?from&to` returns recurrence-expanded occurrences; `useRangeOccurrences` makes one query over the occurrence DTO's `calendarIds`; an item filed into several shown calendars draws once, under `displayCalendarId` (`@lupira/cal-domain/calendars`: the lowest-id shown one, as on mobile). Proposed items ghost from `GET /calendars/{id}/proposed` and are accepted or removed in the item drawer's `CalendarsPanel` (no separate curation screen; `/inbox` redirects to `/`); the availability band joins occurrence → item detail for status. An entry draws in its item's own colour (`itemColor`, `@lupira/cal-tokens/itemColors`), else its calendar's; a `ColorDot` beside the title in the drawer (All events / This and following, not availability items) and `NewItemModal` opens `ColorSwatches` in a popover, "Calendar" clearing it. Tentative items draw outlined (dashed border in the entry's colour over a tint, `TENTATIVE` in `@lupira/cal-tokens/color` via `ui/theme/tentative`); Cancelled ones dim and strike through.

## Subscribed calendars

A calendar can show read-only events from published calendar feeds (cal-api fetches them; rules in `@lupira/cal-domain/subscriptions`).

- `/calendars` → a calendar's "subscriptions…" opens `SubscriptionsPanel`: colour, name, host, status line and event count for every member; owners subscribe (address, name, `ColorSwatches`), rename, recolour, refresh and remove. `useSubscriptions` polls every 5 s while a fetch is due and refreshes the item queries when a feed syncs.
- `GET /items` returns their occurrences with origin `Subscription`; grid entries draw the `subscribed` glyph. A click opens `?subscribed=<calendarId>:<subscriptionId>:<eventId>&at=<start>` → `SubscribedEventCard`.
- `CalendarToggles` nests a show/hide switch per subscription under its calendar, remembered per browser (`localPrefs` `subscriptions.hidden`).

## Holidays

Helgdagar is a standard Agenda calendar of Swedish public holidays and eves that cal-api computes (rules in `@lupira/cal-domain/holidays`).

- `GET /items` returns them as all-day occurrences with origin `Holiday` and `holiday` = `PublicHoliday` | `Eve`; entries draw the `celebration` glyph and open nothing.
- A day with a public holiday draws its number red (`MonthGrid` `DayNumber`, `WeekGrid` header); eves don't. Full cells and folded strips leave holidays out first, with birthdays.
- Hidden with the calendar's own toggle, like any calendar.

## Recurring items

Rules live in `@lupira/cal-domain/seriesOccurrences` (twin of cal-api's series rules, pinned by its fixtures).

- An occurrence is identified by its start in the unmodified series (`originalStart` on `GET /items`), written as `occurrenceKey` (UTC, whole seconds, `Z`); instants are compared as epoch ms. Grid entries carry it; a grid click or an `/items` row opens `?item=<id>&occ=<key>`. `AppShell` hands `occ` to the drawer and drops it with `item`; every other `?item=` link clears it.
- The drawer's Type picker (`CategorySelect`) sets the item's category; it is series-level, so This event dims it.
- The drawer of a recurring item's occurrence has a scope toggle in its sticky header: This event (default), This and following (only from a later rule occurrence), All events. The choice holds while the drawer stays on that occurrence.
  - **This event**: title, status, description and times go through `occurrenceEdit` (merged with the occurrence's existing change; members equal to the series inherit) to `PUT /items/{id}/occurrences/{originalStart}`, or `DELETE` (restore) when nothing is left. Zone, repeats, place, tags and availability are disabled; the payload, attendee, calendar, relation and metadata panels are dimmed and inert.
  - **This and following**: the fields read from the series continuing at the occurrence (`followingSeriesOf`), never the occurrence's own change; the edit goes as `changes` to `POST /items/{id}/occurrences/{originalStart}/following`; the drawer then opens the continuing series at its first occurrence with All events selected. The panels stay inert (they write the original series).
  - **All events**: `PUT /items/{id}`.
- A changed occurrence shows "Changed from the series" with "Revert to series". "Changed occurrences" lists the series' deleted, cancelled and changed occurrences (`seriesDeviationRows`), each with Revert. Cancelled occurrences stay hidden in the grids.
- Delete on an occurrence offers the same scopes: this one (`PUT … { excluded: true }`), this and following (`POST …/following { excluded: true }`), or the whole item.

## /items page

Global list/search across all readable calendars in one infinite query (`useItemSearch`, skip/take paging, filters in URL params: q/tag/cal/category/status/range/from/to/parent); rows open the shared `?item=` drawer at that occurrence. Search covers accepted items only (never proposed).

Hierarchy: one visual level — children nest under their parent's first loaded occurrence (`domain/itemTree.ts`; parent absent → flat row with `↳ parent` chip). `?parent=<id>` drills into all children (API defaults parentId searches to all-time). The drawer has a HierarchyPanel, distinct from RelationsPanel's cross-API edges.

## Task deadlines

Third grid source from LupiraTasksApi (`/tasks-api` BFF prefix, hook `useTaskDeadlines` over the generated `useListItems`). Open non-Cancelled tasks with `dueAt` in range render as all-day chips. Which tasks qualify, due-day pinning, overdue and the deep link are `@lupira/cal-domain/tasks`; `fromTask` (web) and `taskDeadlineRows` (mobile) only shape the row (the deadline/overdue treatment is an `sx` branch in WeekGrid/MonthGrid, not a class). Click → `?task=<listId>:<itemId>` TaskCard with `lupiratasks://task/<listId>/<itemId>` deep link + tasks.lupira.com list fallback. The `CalendarToggles` "Deadlines" toggle gates the fetch. Tasks-api dev listens on 8080 (Kestrel section beats ASPNETCORE_URLS).

New tasks: the calendar toolbar's add-task button and the item drawer's "Task for this event" open `NewTaskDialog` — list (`GET /tasks-api/lists`, writable and unarchived per `@lupira/cal-domain/tasks`, last used in `localPrefs`), title, optional due day (end of that local day). `useCreateTask` reads the list's items for a top-of-list sort key, posts `POST /tasks-api/lists/{listId}/items`, and from an event links it with `POST /api/items/{id}/relations` (`TASK_RELATION`: kind `task`, type `derived-from`, as cal-api's task link tools).

## Contacts

- The list's search box matches contact names and, across every address book, group names (`state/useContactGroups`: one group list per book; contact-api has no cross-book list). An open group (`/contacts/groups/:id`, no `?book`) lists its members from every book; "Add member…" is an autocomplete over names and nicknames.
- Your own contact (contact-api `/me`) carries a "You" chip. "This is me" links a contact in one click only while none is linked; on another contact it asks before moving the link.


## Comms topics

A contact's finished topics from LupiraCommsApi (`/comms-api` BFF prefix, `@lupira/cal-api/query/comms`, hook `useContactTopics`). Reached only from the contact detail's "Comms" link → `/contacts/:contactId/topics/:topicId?`, one `React.lazy` pane (`ContactTopicsPane`, default export) that lists topics or renders one topic's messages — nothing is fetched, and no comms code is loaded, until that link is clicked.

- comms has no topic↔participant link, so `contactId` narrows on `Topic.LastConversationId`: a topic answers for the conversation its latest message landed in.
- Ask for `status=Closed&status=Released` (`SETTLED_TOPIC_STATUSES`): the closer moves topics on within a sweep, so filtering on `Closed` alone finds nothing.
- Labels are the opening message's first words until the titling pass runs (`titled: false` → `topicHeadline` quotes them).

## Contact relationships, residencies and door codes

All three live on contact-api as their own records, never on the contact. Its docs are `docs/relationships.md` and
`docs/residencies.md`.

- **Relationships read the same from both contacts.** Never branch UI on a side.
  - Each side has its own `label` (its word for the other); since/note/ended are shared.
  - Web renders `GET /contact-api/contacts/{id}/relations` (the view from that contact), editable from either contact.
  - `GET /contact-api/relationships` lists them all; the activity tiers use it for `relatedIds`.
- **Residencies are where a contact lives, holidays and works.**
  - Types: Home, Vacation, Work, Other, plus an optional `label`.
  - Web reads `GET /contact-api/residencies` through `state/useResidencies` (`useResidencyRows`). One fetch feeds the place picker and contact cards.
  - The edit form changes residencies one at a time (an end date entered on an open residency, nothing else changed, is a move-out, `POST /residencies/{id}/move-out`); `MoveDialog` tells a household move once (`POST /moves`).
  - A vacation home never makes a household.
  - "Parents' home" is derived, never stored: `@lupira/cal-domain/residents` `parentsHomes`, from Parent relationships
    and their current Home residencies.
- **Door codes belong to a place.**
  - `places/EntryCodes` shows them masked, click to reveal, with copy. It appears on contact cards.
  - Visibility follows the residents: the API answers 404 unless you can read someone living there now.
- **Mobile mirrors all three** via unpaged feeds (`pullRelationships`/`pullResidencies`/`pullPlaceEntries`; schema
  v4–v5) and reads them offline. `ui/components/EntryCodes` shows codes on contact cards. Codes are
  never logged.

## Known API gaps (UI works around)

- No owner-list endpoint (`/calendars/{id}/owners` is POST/DELETE only): the share panel is action-only.
- cal-api's `PUT /items/{id}` accepts `*Provided` sentinels (clear recurrence, switch all-day, edit timezones). The web UI does not send them, so it offers neither recurrence clearing nor all-day switching (null = keep); mobile does (`sync/replayOp.ts`).
- Kind details are read-only except Availability.
