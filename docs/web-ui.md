# Web UI (apps/web)

Shared MUI conventions: `~/Nextcloud/Familj/DevOps/Guides/frontend-estate.md`. This file holds LupiraCal's specifics.

## Stack specifics

- Theme = `ui/theme/muiTheme.ts`: `createTheme({cssVariables: {colorSchemeSelector: 'media'}, colorSchemes})` fed from tokens (teal primary), system-driven dark. Breakpoint `md: 821` is the phone breakpoint (`useIsPhone` wraps `useMediaQuery`).
- Palette (incl. custom `border`, `text.subtle`, `warning`/`success`) emits `--mui-palette-*`; the domain relation accents emit as `--cat-*` via `MuiCssBaseline` styleOverrides, sourced from `@lupira/cal-tokens/contactCategories`.
- No bespoke stylesheet. `index.css` is 39 lines: Tailwind's two entry points, an `@theme inline` that re-exports `--cat-*` as `cat-*` utilities, three element resets, and `.map-canvas` (maplibre-gl.css forces `position:relative` on its own wrapper, so the host must size as a flex child). Tailwind 4 serves utilities on non-MUI elements and vendor DOM reachable only with an arbitrary variant.
- Two `className` hooks are deliberate and load-bearing: `.contact-row` (so the pin reveals on row hover) and `.map-canvas`.
- Vendor stylesheets (maplibre, xyflow) are unlayered and outrank every layer: overriding their rules needs `!`.
- Shared layout primitives in `ui/components/`: `WrapRow`, `DrawerSection`, `Page`/`PageHead`, `Row`/`RowName`, `panes.tsx`.
- Forms = react-hook-form (`Controller`-wrapped MUI fields). `ContactEditForm` gates its 8-endpoint fan-out by payload comparison, not `dirtyFields`.
- Mutation errors → `useSnackbar()` (SnackbarHost); field validation stays inline.
- Detail cards share `drawer/DetailDrawer.tsx`.
- A place renders as `places/PlaceTile` (name, one-line address, meta, a lazy `map/MiniMap` thumbnail framed by `@lupira/cal-domain/mapZoom`, copy button via `useCopy`).
- Per-browser conveniences (last calendar, calendar view per layout, map layers/range) live in `state/localPrefs`, behind the URL.
- Build splits a `vendor-mui` chunk (rolldown `advancedChunks`).
- Icons: `ui/icons.ts` re-exports `@mui/icons-material` `*Outlined`. `packages/tokens/src/icons.ts` names concepts, not glyphs, so it stays dependency-free; `ICON_BY_NAME` in `ui/theme/kinds.ts` is `Record<IconName, SvgIconComponent>`, making an unmapped concept a compile error. `SavedPlaceDto.icon` is geo-api data, rendered verbatim.
- Screens: the three lazy routes (`MapScreen`, `PlacesScreen`, `PhotosScreen`) keep `export default` because `React.lazy` needs one; the filename still matches the symbol. `ContactsLayout` lives in `ui/navigation/` — routing structure, not a screen.

## Calendar visibility and writability

`@lupira/cal-domain/calendars`: Agenda calendars start shown, System hidden; a per-calendar choice overrides.

- Web: `CalendarToggles` (side panel on desktop, sheet on phones; only the calendar screen renders it), remembered in `localPrefs`.
- Mobile: Settings → Calendar, `prefs.calendarChoices`, applied by `useCalendarFilter` to the grids, search, map events and the jump strip (Birthdays hides synthesized birthdays).
- Every filing picker offers only `canWriteCalendar` (Owner/ReadWrite) calendars.

## Grids

Hand-rolled (no calendar lib). `GET /items?from&to` returns recurrence-expanded occurrences; `useRangeOccurrences` makes one query and groups by the occurrence DTO's `calendarIds`. Proposed items ghost from `GET /calendars/{id}/proposed`; the availability band joins occurrence → item detail for status.

## /items page

Global list/search across all readable calendars in one infinite query (`useItemSearch`, skip/take paging, filters in URL params: q/tag/cal/category/status/range/from/to/parent); rows open the shared `?item=` drawer. Search covers accepted items only (never proposed).

Hierarchy: one visual level — children nest under their parent's first loaded occurrence (`domain/itemTree.ts`; parent absent → flat row with `↳ parent` chip). `?parent=<id>` drills into all children (API defaults parentId searches to all-time). The drawer has a HierarchyPanel, distinct from RelationsPanel's cross-API edges.

## Task deadlines

Third grid source from LupiraTasksApi (`/tasks-api` BFF prefix, hook `useTaskDeadlines` over the generated `useListItems`). Open non-Cancelled tasks with `dueAt` in range render as all-day chips. Which tasks qualify, due-day pinning, overdue and the deep link are `@lupira/cal-domain/tasks`; `fromTask` (web) and `taskDeadlineRows` (mobile) only shape the row (the deadline/overdue treatment is an `sx` branch in WeekGrid/MonthGrid, not a class). Click → `?task=<listId>:<itemId>` TaskCard with `lupiratasks://task/<listId>/<itemId>` deep link + tasks.lupira.com list fallback. The `CalendarToggles` "Deadlines" toggle gates the fetch. Tasks-api dev listens on 8080 (Kestrel section beats ASPNETCORE_URLS).

## Comms topics

A contact's finished topics from LupiraCommsApi (`/comms-api` BFF prefix, `@lupira/cal-api/query/comms`, hook `useContactTopics`). Reached only from the contact detail's "Comms" link → `/contacts/:contactId/topics/:topicId?`, one `React.lazy` pane (`ContactTopicsPane`, default export) that lists topics or renders one topic's messages — nothing is fetched, and no comms code is loaded, until that link is clicked.

- comms has no topic↔participant link, so `contactId` narrows on `Topic.LastConversationId`: a topic answers for the conversation its latest message landed in.
- Ask for `status=Closed&status=Released` (`SETTLED_TOPIC_STATUSES`): the closer moves topics on within a sweep, so filtering on `Closed` alone finds nothing.
- Labels are the opening message's first words until the titling pass runs (`titled: false` → `topicHeadline` quotes them).

## Contact relationships

Relationships read the same from both contacts — never branch UI on which contact stores one. `ContactDto.relations` is storage (the copies that contact holds), not the relationship: web renders `GET /contact-api/contacts/{id}/relations` and edits from either side; mobile uses `useContactRelations` (mirror `relationCopiesOf` → `@lupira/cal-domain/contactRelations` `resolveRelations`, the same merge as contact-api's `RelationResolver`). `label` is per side (the viewed contact's word for the other); since/note/ended are shared. The follow-up move to a `Relationship` aggregate is planned in LupiraContactApi `docs/relationships.md`.

## Known API gaps (UI works around)

- No owner-list endpoint (`/calendars/{id}/owners` is POST/DELETE only): the share panel is action-only.
- cal-api's `PUT /items/{id}` accepts `*Provided` sentinels (clear recurrence, switch all-day, edit timezones). The web UI does not send them, so it offers neither recurrence clearing nor all-day switching (null = keep); mobile does (`sync/replayOp.ts`).
- Kind details are read-only except Availability.
