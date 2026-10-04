# Lupira Calendar Mobile — milestones

React Native app (Android-first, offline-first) in this repo: `apps/mobile` (Expo dev
client) + `packages/domain` (shared pure TS). Sync = REST delta endpoints (changes /
cursor / tombstone vocabulary) on cal-api + contact-api, through the web BFF as single
gateway. Statuses: `pending` | `in-progress` | `done` | `blocked(<reason + unblock>)`.
This file is the single source of truth — updated in the same commit as the work; exit
criteria are verifiable commands/observations.

| M  | Title | Repos | Status |
|----|-------|-------|--------|
| M0 | Monorepo restructure | LupiraCal | done |
| M1 | cal-api sync surface | LupiraCalApi | done |
| M2 | contact-api sync surface + BFF bearer + Authentik | LupiraContactApi, LupiraCal | done |
| M3 | App skeleton + auth | LupiraCal | done |
| M4 | Sync engine | LupiraCal | done |
| M5 | Calendar + contacts UI | LupiraCal | done |
| M6 | Bridge spike (throwaway) | LupiraCal | done |
| M7 | Bridges full two-way | LupiraCal | in-progress |
| M8 | Hardening + release | LupiraCal | in-progress |
| M9 | Task deadlines on the calendar | LupiraCal | in-progress |
| M10 | Material re-skin (Paper + shared tokens) | LupiraCal | in-progress |
| M14 | Device feedback pass | LupiraCal, LupiraCalApi | in-progress |

Fixed identity: Android package `com.lupira.calendar`, scheme `lupiracalendar`
(redirect `lupiracalendar://oauthredirect`), Authentik public client `lupira-cal-mobile`,
display name "Lupira Calendar".

## M0 — Monorepo restructure   [status: done]

npm workspaces; extract `@lupira/cal-domain` (packages/domain, consumed as source via
`exports: {"./*": "./src/*.ts"}`); web client + BFF stay put; repo/remote/deploys untouched.

### Scope
- [x] Client toolchain bumps in place: eslint-plugin-boundaries ^7.1.0 (config migrated to v7 policies/entity selectors; config.ts → config/ so the element still classifies), typescript-eslint ^8.65.0, vitest ^4.1.10, orval ^8.23.0. TS stays 6.0.3 — typescript-eslint peers `<6.1.0` and TS 7 crashes its parser; revisit when support lands
- [x] Root package.json (workspaces: packages/*, apps/web, apps/*), root lock, `.npmrc` moved to root, toolchain devDeps hoisted
- [x] Dockerfile client stage rebuilt for workspace install; tests.yml uses root scripts + root lock cache path
- [x] Move 13 domain modules + tests → packages/domain/src; move partialDate.ts with structural PartialDate type (no generated import)
- [x] Import codemod to `@lupira/cal-domain/*`; web eslint drops `domain` element; domain package gets purity-enforcing eslint (`boundaries/external` disallow)
- [x] Docs: README/CLAUDE.md layout notes; verify skill path fix

### Exit criteria
- [x] Root `npm ci` clean; `node_modules/@lupira/cal-domain` is a workspace symlink
- [x] Root `npm run lint && npm run typecheck && npm test` green (domain: 13 suites / 87 tests; web: passWithNoTests)
- [x] Root `npm run build` emits to src/LupiraCalBff/wwwroot; `docker build .` succeeds
- [x] `npm run gen:api` still resolves sibling repo specs (client cwd unchanged)
- [x] Vite dev serves workspace domain source (smoke: `/@fs/**/packages/domain/src/time.ts` transpiled)
- [x] CI green on main (release run 2026-07-28 on sha-c4c4de0)

### Non-goals
No Expo app yet; no backend/.NET/slnx/deploy changes; no entries.ts split; no path
aliases; no barrel index; no orval regen.

## M1 — cal-api sync surface   [status: done]

Additive only — existing routes and the legacy feed untouched; web unaffected.

### Scope
- [x] Projected `UpdatedSequence` (indexed, set in `Apply(IEvent<T>)`) + `createdAt`/`updatedAt`/`version` on snapshot and DTO. The planned flat `CalendarIds[]` column proved unnecessary: the feed query filters on the item's memberships. Event store switched to Rich append mode (Quick assigns sequences server-side at INSERT — inline applies read 0)
- [x] `GET /sync/changes?since={cursor}&limit={n}` → `{cursor, hasMore, reset, changed[full DTOs + guards], deleted[ids]}` — indexed watermark query over items filed to a readable calendar, paged (default 200/cap 500); deleted = soft-deleted ∪ unfiled; the cursor carries a readable-calendar scope, so a grant/revoke answers `reset` (full sync)
- [x] `GET /sync/containers` → calendars snapshot (plain docs have no cursor)
- [x] Per-section LWW guards on the snapshot — sections: `core`, `metadata`, `payload` (prompt/action share the XOR slot, one guard), `filing` (per-calendar dict). Tasks-api wins rule byte-for-byte; unstamped events fall back to event timestamp + sequence-encoded command id (append order preserved). Delete absorbing. Deviation: participants stay append-ordered (rare conflicts; Idempotency-Key still dedups replays)
- [x] `occurredAt` optional on mutating endpoints (PUT body; `?occurredAt=` on metadata/clears/curation; payload set via body)
- [x] Idempotency ledger port (ProcessedCommand, same-transaction insert with event append; PK violation rolls back the loser); `Idempotency-Key` header on update/delete/metadata/payload/curation. Creates need no key — `SourceKey` already pins the stream id
- [x] PUT core totalized with `*Provided` sentinels: `startsAt/endsAt/startDate/endDate/startTimezone/endTimezone/recurrenceRule` + `isAllDay` (bool?, null = keep)
- [x] `tools/FixtureEmitter` (LupiraCalApi; takes an output directory) → `recurrence.json` for `packages/domain/test/fixtures/` and `lww-vectors.json` for LupiraPlatform `packages/lupira-sync-core/test/fixtures/` (17 recurrence cases, 10 LWW vectors; `--from-db` mode ingests real rules)
- [x] `sectionGuards` on the sync DTO; OpenAPI regen → downstream `gen:api` ran

### Exit criteria
- [x] Curl delta loop against dev stack: create → changed; edit → changed with guards; unfile → tombstone; delete → tombstone; quiet cursor stable; containers snapshot OK
- [x] Replayed Idempotency-Key: PUT replay returns prior state without reapplying; DELETE replay 204 instead of 404 (integration tests + curl)
- [x] Server LWW suite green (SectionLwwTests, 12 tests); vectors exported for the client twin
- [x] Full suites green: 140 unit / 133 integration (incl. legacy feed + web-facing routes untouched); web client regenerated, lint/typecheck/test/build green

### Manual steps
- [x] Deploy includes one-time projection rebuild: `dotnet LupiraCalApi.dll --rebuild-items` (run 2026-07-28 — cal-api sha-8cf1b83 deployed, schema applied, projection rebuilt)

## M2 — contact-api sync surface + BFF bearer + Authentik   [status: done]

### Scope
- [x] contact-api `/sync/changes` (same contract; scoped to readable books + books a contact moved out of, so moves still tombstone) + `/sync/containers` (books + groups — groups leave the cursor domain, closing the group feed gap)
- [x] Per-section guards + occurredAt + idempotency ledger (same port as M1). Deviation: channel and tag writes ride the `ContactRevised` event server-side, so they share the `core` guard — sections are core/addresses/profiles/avatar/metadata/deceased (mark/clear share one). Relations + emergency contacts stay append-ordered. Bonus: `CreateContactRequest.SourceKey` added — offline creates are replay-safe (cal already had it)
- [x] BFF: JwtBearer second scheme (`Auth:Bearer:Authority` ?? OIDC authority; aud `lupira-cal`); Default policy = interactive scheme OR bearer; YARP forwards a caller-presented bearer verbatim (transform stands aside), else Duende cookie exchange
- [x] 302-vs-401 guard covers `/api` + `/geo-api` + `/contact-api` (cookie login/denied + OIDC challenge)
- [x] BFF launchSettings binds 0.0.0.0:5181 (physical-device dev)

### Exit criteria
- [x] PKCE token minted from `lupira-cal-mobile` → BFF succeeds. Verified headlessly to the interactive boundary: discovery live (issuer Global, S256, all scopes), authorize endpoint 302s into the login flow with the app's exact client/redirect/scopes; the BFF leg is proven by the integration tests. The full mint needs a human login — exercised at M3's device sign-in exit
- [x] Browser cookie flow unchanged (OIDC/cookie wiring untouched apart from the challenge guard; non-API challenge still redirects — covered by test)
- [x] BFF integration tests cover both auth paths (tests/LupiraCalBff.IntegrationTests, stub upstream: bearer accepted + forwarded verbatim on all three prefixes, wrong-audience/garbage bearer rejected, anonymous API calls 401 not 302, page navigation still redirects). contact-api: 168 unit / 96 integration green

### Manual steps (all Authentik)
- [x] Public client `lupira-cal-mobile`: PKCE, blank secret, subject mode email, issuer Global (verified via discovery)
- [x] Redirect regex `^lupiracalendar://.*$` (verified: authorize accepts `lupiracalendar://oauthredirect`)
- [x] Scopes: openid email profile offline_access + lupira-cal-aud + lupira-contact-aud + lupira-geo-aud (`groups` deliberately omitted — nothing in the mobile path needs it)
- [x] Deploy note: contact-api needs one-time `dotnet LupiraContactApi.dll --rebuild-contacts` (run 2026-07-28 — contact-api sha-d874085 deployed, schema applied, projection rebuilt; cal-web BFF sha-c4c4de0 live with the bearer front door)

## M3 — App skeleton + auth   [status: done]

### Scope
- [x] apps/mobile: Expo SDK 57 + dev client (RN 0.86.0 — 0.86.2 sits inside the npm release cooldown), React Navigation 7 shell (Calendar / Contacts / Settings tabs + Sync issues / Debug log stack), package `com.lupira.calendar`, scheme `lupiracalendar`
- [x] Orval per-app generation (cal `/api`, contact `/contact-api`, geo `/geo-api` — one BFF origin, prefix picks the upstream; raw fetchers with per-status envelope unions) + mutator (bearer via AuthPort, 10s timeout, Retry-After-aware retry, one forced re-auth per call)
- [x] Native OIDC: expo-auth-session system browser + PKCE against `lupira-cal-mobile` (hand-rolled code exchange for visible errors; `createTask:false`; non-empty redirect path); tokens in expo-secure-store
- [x] AuthPort inversion; coalesced single-flight refresh, rotation-safe (`sentToken` guard), definitive (400/401 → sign out) vs transient (keep session) classification
- [x] Settings screen: presets Production (oidc) / LAN dev `192.168.14.108:5181` (dev auto-auth) / Emulator `10.0.2.2:5181` / custom URL+mode; default from `EXPO_PUBLIC_API_URL`; persisted; reachable from the login screen too
- [x] Debug ring buffer + on-device log screen; uuid v7 + expo-crypto polyfill as first import
- [x] Calendar tab carries the `/api/me` connection smoke (proves token/dev-header → BFF → cal-api)

### Exit criteria
- [x] Dev-client APK on a physical device signs in against prod BFF and Calendar shows "Connected as …" (verified 2026-07-28 on the S23: Authentik sign-in, full sync pulled calendar items + contacts)
- [x] LAN preset criterion dropped 2026-07-28 — prod deployed early and became the dev loop; the Emulator preset covers future local dev
- [x] Refresh rotation-safe under concurrent calls + token persistence round-trip (vitest: 24 tests — refresh machine, mutator 401/retry paths, retry policy); Metro bundle exports clean; all root gates + docker build green (Docker installs web workspaces only)

### Manual steps
- [x] Dev client built + installed on the S23 2026-07-28 (`npx expo run:android`; Ubuntu SDK via cmdline-tools, inotify limits raised)

## M4 — Sync engine   [status: done]

### Scope
- [x] Mirror schema (items + item_calendars + occurrences + contacts + containers + outbox + sync_state + mirror_meta); append-only migration ladder on user_version; outbox never dropped (ops carry envelope_version)
- [x] Exclusive transactions: every mirror helper takes a Tx; writes only inside Db.exclusive (expo `withExclusiveTransactionAsync` / node BEGIN IMMEDIATE + mutex)
- [x] Outbox: per-row backoff (next_attempt_at, exp + jitter, 30 min cap), park after 8 attempts, causal hold (SQL NOT EXISTS earlier parked sibling), 429 = retry, 401 = pause untouched
- [x] Client LWW twin: `@danbro96/lupira-sync-core/lww` passes the emitted vector suite (sub-ms ISO precision preserved — Date.parse would mis-tie .NET's 7-digit timestamps); reducers seed per-section guards from sync `sectionGuards`; rebase folds pending AND parked ops over the server base
- [x] Paged delta pull that reads the cursor (persisted per page); a full sync (no cursor, or a server `reset`) that never completed restarts, since its prune needs every id; tombstone apply; full-sync prune keeps pending local creates; containers snapshot replace; first sync seeds missing standard containers (`@lupira/cal-domain/bootstrap`)
- [x] TS recurrence expander in packages/domain — 17/17 parity fixtures (incl. Ical.Net's non-matching-DTSTART behavior); occurrence materialization over a −12/+24-month rolling horizon with drift re-materialization; birthday synthesis (year-less + Feb 29)
- [x] monthKey-scoped react-query invalidation (no global revision counter); deterministic ids (MD5 + .NET Guid layout, pinned against real .NET output) so offline creates need no temp-id reconciliation
- [x] expo-background-task registration (15-min floor, best-effort) + foreground triggers (app-active, connectivity, sign-in, post-enqueue)
- [x] node:sqlite in-memory harness from day one — the entire engine (transactions included) runs under vitest

### Exit criteria
- [x] Engine covered under vitest (62 mobile + 123 domain tests): replay classification, backoff/park, causal hold, migration ladder incl. outbox survival, LWW vectors, expander parity, pull-with-pending-section-edit regression, deletion reconciliation, discard-rolls-back contract
- [x] Full + delta sync loops green against the LIVE dev stack (throwaway harness test, run then removed): offline create → drain through BFF → delta returns real section guards; cross-writer web PUT arrives on next delta; delete round-trips as tombstone; birthday synth from a created contact
- [x] Device: airplane-mode edit → kill → relaunch → reconnect → server converges (verified 2026-07-28 against prod)
- [x] Concurrent cross-writer edits (phone offline vs web) converge to the later occurredAt on both — same LWW path the two-device case exercises
- [x] Background task observed firing on device (best-effort under Doze, as documented)

## M5 — Calendar + contacts UI   [status: done]

### Scope
- [x] Week/month grids on packages/domain grid math (`monthMatrix`, `clampToDay` + `layoutColumns`); grids read only the `occurrences` table via one joined range query (`gridRowsBetween`: title/status/calendar color join — no per-item fan-out, no render-time expansion). Month view + selected-day agenda; week view with all-day chips + timed lanes
- [x] Item detail + per-section editing → outbox ops: core (whole-section form → totalized revise), metadata merge editor, filing toggles (file/unfile per mirror calendar), delete. Editing lives in pure `domain/editors.ts` (form ⇄ core, keep-vs-clear warts, timed/all-day duality) — vitest-covered
- [x] Offline-editable matrix enforced by construction: place attach, avatar, sharing, and group membership have no mobile write UI (web covers them). Deviation from plan: contact addresses joined the online-only set — an address is `{placeId, type}`, composing one requires geo place search, so detail shows a read-only summary
- [x] Contacts list (search, birthday badges) + detail (channels/tags/profiles wholesale editors → their ops, birthday with next-age, notes) + create/edit core forms; birthdays render in month cells, week all-day row, and the agenda
- [x] Sync issues screen: parked cards with op label/attempts/last error, expandable op JSON, per-row Retry (`retryOne`) and Discard (confirm → `discardParkedAndRestore` rolls the mirror back to server truth); waiting-to-sync list with backoff times; Sync now
- [x] Reactivity closure: `['items']`/`['outbox']` invalidation on enqueue/pull/drain/discard; `@react-native-community/datetimepicker` 9.1.0 added (native module — rides the still-pending first dev-client build)

### Exit criteria
- [x] Month/week render full family data offline from the mirror (verified 2026-07-28, airplane mode)
- [x] Every editable section edited offline round-trips to the server and shows in web UI
- [x] Birthdays visible in month + week grids
- [x] Code-level: 75 mobile + 123 domain tests green (incl. grid join, contact list, per-row retry); root lint/typecheck green; Metro bundle exports clean

## M6 — Bridge spike (throwaway)   [status: done]

### Scope
- [x] Kotlin AccountAuthenticator + stub sync adapter — packaged as a LOCAL EXPO MODULE (`modules/lupira-bridge`) instead of a config plugin: library manifest merges services/permissions/xml natively, survives prebuild by construction, and gives JS a typed API for free (the plugin-viability question, answered — see docs/mobile/bridge-spike.md)
- [x] One-way CalendarContract publish (as sync adapter under account `com.lupira.calendar`, own Lupira calendar, wholesale window publish keyed on `_SYNC_ID`); ContactsContract RawContacts sample read (ACCOUNT_TYPE/SOURCE_ID/DIRTY/DELETED)
- [x] Bridge spike screen (Settings → Bridge spike): permissions, ensure/remove account, publish ±1 month, request OS sync (onPerformSync stamps last-sync state), contacts sample
- [x] Written go/no-go learnings: account lifecycle, dirty-flag mechanics (docs/mobile/bridge-spike.md — verdict GO; device-verified findings incl. WRITE_SYNC_SETTINGS requirement, isAlwaysSyncable manual-sync behavior, account-removal purge, foreign-account DIRTY noise, contacts authority needed for a contacts source)

### Exit criteria
- [x] Lupira account visible in Android Settings; 49/49 published events visible + correctly rendered in Samsung Calendar; onPerformSync observed; account removal purges the calendar (verified 2026-07-28, S23)
- [x] Learnings doc committed; M7 scope adjusted from it (6 items in bridge-spike.md)

## M7 — Bridges full two-way   [status: in-progress]

Staged per the spike findings (docs/mobile/bridge-spike.md). Kotlin = provider I/O only;
inbox-row → op translation is pure TS under vitest. Write-back field subset — events:
title, description, schedule (timed + all-day), recurrence rule, delete, create;
contacts: structured name, phones, emails, birthday, delete, create. Out of scope:
location write-back (ItemCore has no location field — publish-only), calendar moves in
stock apps (overwritten by next publish), payload/participants.

### Scope
- [x] S1 Calendar publish v2 inside onPerformSync: mirror `items` → one provider calendar per mirror calendar (name/color), events upserted by `_SYNC_ID` = item id, RRULE rows for recurring items (not expanded instances), all-day/timed mapping, content-hash skip via SYNC_DATA1, stale-row/calendar deletion; birthdays left to the contacts bridge
- [x] S2 Calendar write-back (device matrix verified 2026-07-28: stock edit/create/delete → web; web → stock; no duplicates; echo suppressed): dirty/deleted/created rows captured to a Kotlin-owned bridge inbox db (capture-then-clear DIRTY as sync adapter), JS drain translates inbox → item.create/revise/delete through the normal outbox/LWW path; stock-created events get `_SYNC_ID` assigned post-create (no duplicate creation); echo suppression = value-hash comparison on publish
- [x] S3 Contacts adapter + publish (device-verified: Lupira contacts source live, cards render, deep link works; Samsung renders no third-party MIME rows and offers no third-party storage — see bridge-spike.md addendum): second sync service on the contacts authority (account becomes a contacts source), raw-contact upsert by `SOURCE_ID` (StructuredName/Phone/Email/Birthday event row), "Open in Lupira" MIME row
- [x] S4 Contacts write-back (device-checked: stock edit/delete round-trip OK): dirty/deleted Lupira raw contacts → inbox → contact.revise + wholesale contact.channels (+1ms guard ordering) / contact.delete; echo guard compares stock-expressible fields against the mirror; channel types the provider ints lost are re-attached from the mirror. Creation branch dropped — Samsung offers no third-party contact storage (stock-created contacts stay in Phone/Google, invisible to the adapter)
- [x] S5 OS-scheduled drive (code; final no-taps device check pending): auto-sync + hourly periodic sync on both authorities (ensureAccount, idempotent); provider-change upload syncs capture stock edits near-immediately; every engine sync ends with capture→publish + inbox drain, so app-active and the 15-min background task move both directions. Latency contract: stock→server waits for the next JS run (app open or background tick); web→stock lands on the same cadence

### Exit criteria
- [ ] Two-way edit matrix passes (stock apps ↔ server, both domains, the field subset above) without duplicate creation
- [ ] Stock-app edit round-trips to the web UI and a web edit lands in the stock app without manual sync taps

## M8 — Hardening + release   [status: in-progress]

### Scope
- [x] Distribution switched from the planned self-distributed APK to the LupiraTasksMobile pipeline: EAS build (managed signing, project danbro96/lupira-calendar, appVersionSource remote + autoIncrement) → Play Console internal testing. v1.0.0 production AAB building; flow documented in docs/mobile/release.md
- [ ] Upgrade drill: previous build with queued outbox → upgrade → drain verified
- [x] Grid perf pass (memoized Month/Week views, stable callbacks — release builds also shed dev-mode overhead); http presets hidden in release builds (cleartext blocked); docs refreshed (README, docs/mobile/release.md)
- [x] Release polish punch list (10 items, 2026-07-29): sync progress phases + live counts (no more "all synced" lie mid-sync) and batched multi-row mirror INSERTs (first sync minutes → seconds); week-view tap-a-slot ＋ create (1h prefill); contact detail = read-only overview with most DTO fields (unified Reach = channels + profiles, addresses tap-open Google Maps via geo lookup, relations/emergency resolved from the mirror) with all editing consolidated on the edit screen incl. an add-reach dropdown (Telegram/Signal/WhatsApp/Web ride Social Profiles — ReachMedium deliberately unchanged, vCard hazard); "Enter year" birthday input with month/day fields (no fake 2000, mobile + web edit + web create); shown-as defaults to First + Last (server-side + mobile create); system calendars + their events hidden behind a Settings toggle (Birthdays is Agenda-class, exempt); Birthdays calendar unfileable (server 400 + client filter); category-first event form with schedule-shape defaults; month view = full-screen grid + draggable day sheet (drag down deselects, month change clears) with an add button; Today button replaces ＋ in the month toolbar
- [x] Follow-up polish (2026-07-29): week view creates from half-hour slots (1h prefill) and lost its toolbar ＋; horizontal swipe steps month/week in both views; **availability is a first-class status surface** — Availability-kind calendar is unselectable for events, its entries render as a background band (week column tint, month day strip, status pill in the day sheet) and are entered through a dedicated status+range quick-add (mobile screen from the day sheet; web modal on a secondary FAB), with the presence status riding the create op; reach rows lock their kind at add time and show per-kind icons with smart deep links (tel/mailto/t.me/signal.me/wa.me/https)
- [x] Settings UX hardening: user-facing Settings = session / Android-integration toggle / sync surface / version; bridge setup is automatic (one-time post-sign-in prompt → permissions + account + first publish; toggle-off removes the account, purging published data; self-repair on app start); backend switching, debug log, and the bridge manual controls moved behind a Developer row (BridgeSpike → BridgeDiagnostics); preference lives in mirror_meta so the sync engine gates bridge work without crossing layer boundaries

### Exit criteria
- [ ] Upgrade-in-place with pending offline edits loses nothing
- [ ] Month swipe jank-free on the target device; docs current; tracker closed out

## M9 — Task deadlines on the calendar   [status: in-progress]

Read-only, **online-only** third grid source (after items and birthdays), mirroring the web
feature shipped 2026-08-02. The SQLite mirror and sync engine are untouched by design —
tasks-api has no global changes cursor (only per-list `/sync`), so offline the grids simply
lack deadlines while everything else stays.

### Scope
- [x] orval `lupiraTasksApi` block (Items tag only, baseUrl `/tasks-api`) → `generated/tasks/`; BFF route + `dueFrom/dueTo` search shipped server-side 2026-08-02
- [x] `lupira-tasks-aud` added to `OIDC_SCOPES` (refresh grants never widen scopes — see Manual steps)
- [x] `domain/taskRows.ts` + tests: GridRow-shaped `source:'task'` rows (all-day pin on the local due day — dueAt is "done by"), `isTaskRow` guard, half-open `monthUtcRange`, `taskDeepLink`
- [x] `useTaskDeadlines(dayKeys)` in state/queries: key `['tasks', monthKey]` (outside every sync-invalidation prefix), `staleTime 60s` + `retry 1` (mirror defaults Infinity/false would freeze it), gated on the pref + `serverReachable` (onlineManager isn't NetInfo-wired; the reachable flip is the reconnect trigger); Cancelled dropped client-side
- [x] Render merges: MonthView bars, WeekView all-day strip, day-sheet agenda — muted outline chips, ⏰ prefix, danger when overdue; `CalRow = GridRow | TaskDeadlineRow` union at the seams
- [x] Tap → in-app read-only `TaskDetailScreen` (`{listId, itemId}`): due/status/priority/notes/assignee + "Open in Lupira Tasks ↗" deep link (`lupiratasks://task/<listId>/<itemId>`, fire-and-catch — no canOpenURL, keeps the `<queries>` manifest out)
- [x] `showTaskDeadlines` pref (mirror_meta, default on) + Settings switch under Calendars

### Exit criteria
- [x] Root `npm run typecheck` / `lint` / `test` green (taskRows tests ride the mobile vitest gate)
- [ ] Device: task due this month shows in month bar + week all-day chip + day agenda on its local due day; past-due renders danger + `overdue` tag
- [ ] Device: Settings toggle removes/restores chips without restart; airplane mode → calendar renders normally, deadlines absent, no error surface
- [ ] Device: tap → TaskDetail shows the task; "Open in Lupira Tasks" lands on the task in LupiraTasksMobile

### Manual steps
- [ ] Authentik: map the `lupira-tasks-aud` scope onto the `lupira-cal-mobile` provider and select it in Scopes (the web `lupira-cal` provider got it 2026-08-02)
- [ ] Device: sign out/in after the Authentik step — refresh grants re-mint the old audience set, so until then every `/tasks-api` call 401s and chips stay silently absent

### Non-goals
- No task create/edit/complete from the calendar; no offline cache or sync-engine integration (no migration, no `gridRowsBetween` change, no per-list polling); no `<queries>` manifest / `canOpenURL`

## M10 — Material re-skin (Paper + shared tokens)   [status: in-progress]

react-native-paper 5 (MD3) themed from `@lupira/cal-tokens` — the same token package that feeds the
web MUI theme. Headline win: real dark mode (`useColorScheme`-driven; OS plumbing was already in place).
Grids (MonthView/WeekView), the PanResponder day-sheet, and the sync engine are untouched.

### Scope
- [x] `PaperProvider` + MD3 light/dark themes from tokens; React Navigation themes adapted
- [x] `ConfirmDialogHost` + `useConfirm()` (Portal + Dialog); confirm-style `Alert.alert` converted (6 screens; `useUnsavedGuard` and informational alerts deliberately stay)
- [x] Widget sweep: form.tsx (Button/Chip/labels/date triggers), ProgressBar, Banner (sync + bridge prompt), Avatar.Text, FAB, List.Item switch rows, Centered deduped
- [x] Hex-literal audit → `useTheme()` lookups (white-on-calendar-color text stays literal); `ACCENT` retired — primary is the token teal
- [x] palette.ts re-exports availability/birthday/fallback colors from tokens (3 availability hues flipped to web-canonical)

### Exit criteria
- [x] Root `npm run typecheck` / `lint` / `test` green
- [ ] Device: live light↔dark switch (no restart), StatusBar contrast in both schemes on tab + stack screens
- [ ] Device: Paper Dialog renders over the nav stack; day-sheet FAB clear of the sheet snap points
- [ ] Play internal build via the normal EAS path before rollout

## M11 — Map tab (basemap + events/saved layers)   [status: in-progress]

Fourth bottom tab rendering the self-hosted basemap via `@maplibre/maplibre-react-native` (MapLibre
Native Android 13.x — reads `pmtiles://https://` sources natively with Range requests). First phase of
the Lupira Photos program: the photos layer lands here once lupira-photo-api exists.

### Scope
- [x] `@maplibre/maplibre-react-native` (^11.3.6) + `@types/geojson`; app.json plugin; prebuild = no android/ diff (autolinked)
- [x] `data/mapStyle.ts` — RN port of the web loader (BFF `/geo-api` prefix, bearer fetch, absolute-URL rewrite, pmtiles Range probe, fallback wash)
- [x] `data/mirror.ts` `mapEventRowsBetween` — placed items with occurrences in range, one pin per item (GROUP BY), calendar for color
- [x] `state/map-queries.ts` — `useMapStyle`, `useEventFeatures` (mirror + `lookupPlaces` hydration, ≤200/chunk), `useSavedPlaceFeatures`; network queries gated on `serverReachable` with staleTime/retry overrides (task-deadlines pattern)
- [x] `ui/screens/MapScreen.tsx` — Map/Camera/GeoJSONSource/Layer, clustered events (radius 48 / maxZoom 14, step-sized cluster circles + counts), saved-place pins + labels, tap pin → ItemDetail, tap cluster → expansion zoom, layer chips, dark/light style via `useColorScheme`
- [x] Bearer on native tile requests: `TransformRequestManager.addHeader` with stable id (in-place token rotation) and `match` scoped to the BFF origin — presigned/third-party URLs never see the header
- [x] Palette copied web-canonical into `ui/map/mapTokens.ts` (saved/eventFallback/ring/ink only)
- [x] Mobile orval regen (picked up `lookupPlaces`)
- [x] Hotspots layer (off by default; all-time `GET /hotspots` halos beneath the pins, tap → stats sheet)

### Exit criteria
- [x] Root `npm run typecheck` / `lint` / `test` green
- [ ] Device: basemap renders both themes off-LAN (bearer header on tiles/glyphs/sprite proven); fallback wash + banner when assets unprovisioned
- [ ] Device: event pins colored by calendar, cluster expand on tap, pin tap opens ItemDetail; saved places labeled
- [ ] Device: token expiry mid-pan — tiles keep loading after refresh (header updated in place)
- [ ] EAS dev-client build (new native module — OTA can't deliver this)

### Non-goals
- Movement/contacts layers (need `lupira-location-aud` scope + re-login — bundle with `lupira-photo-aud` when the photos phase adds scopes); time-range control; photos layer (needs lupira-photo-api)

## M12 — Live location, movement layers, and the GPS uploader   [status: in-progress]

The Map tab gains a sense of place: your live position, where you've been, your people. And the phone
becomes the estate's **first GPS uploader** — LupiraLocationApi has been running with an empty database
because nothing has ever written to `/ingest/location`. The movement layer renders nothing until this
ships, which is why the recorder and the layer land together.

### Scope
- [x] `lupira-location-aud` on the mobile OIDC scopes; sixth orval target (`Me` + `Ingest` tags excluded — location's `/me` would shadow cal's, and ingest can't use the generated mutator)
- [x] `domain/locationFix.ts` — wire shape, speed→activity ladder, cadence profiles + hysteresis, snake_case NDJSON, reject disposition, receipt coherence
- [x] `location_fix_queue` migration + `data/locationQueue.ts` (seq monotonic across a full drain, defer, prune, cap)
- [x] `sync/locationRecorder.ts` — TaskManager task + foreground service, adaptive cadence, admission gates (accuracy > 50 m and out-of-window timestamps never reach the queue)
- [x] `sync/locationIngest.ts` — hand-written DeviceKey client posting **direct to location-api**, bypassing the BFF
- [x] `sync/locationUploader.ts` — batch drain, receipt reconciliation, `highWaterSeq` pruning, cursor repair, revoked-device handling
- [x] `state/location-tracking-store.ts` — two-step permission sequence, device registration, pause, erase, foreground reconcile
- [x] Map: live puck via `LayerAnnotation` (our own fix stream, not a second GPS subscription), movement/contacts layers, layers sheet + locate FAB, visit sheet, contact pin → ContactDetail
- [x] Settings: tracking toggle, pause, queue status, background-permission warning, erase history
- [x] 29 unit tests (domain + `node:sqlite` queue); root typecheck/lint/test green

### Exit criteria
- [ ] Authentik: `lupira-location-aud` mapped onto the `lupira-cal-mobile` provider, then a forced sign-out/in
- [ ] EAS dev-client build (expo-location + background permissions are native — OTA cannot deliver them)
- [ ] Device: permission sequence runs foreground → notifications → background as SEPARATE prompts; a combined request is never issued
- [ ] Device: foreground-service notification visible on Android 14; recording survives the app being swiped from Recents
- [ ] Device: walk → drive → sit; `logDebug('location')` shows the cadence switching only after a sustained streak
- [ ] Device: airplane mode grows the queue, reconnect drains it, `GET /location/track` shows no gaps and no duplicates
- [ ] Device: force-stop mid-upload → next pass re-sends → receipt reports `duplicates`, queue empties, no double rows
- [ ] Device: after a day, `/location/visits` returns home/work and the Movement layer draws dwell circles + an activity-coloured track
- [ ] Device: a photo with no EXIF GPS geotags via the location-history fallback (that path has never had data to work with)
- [ ] Battery: overnight stationary drain is acceptable — the one number that decides whether the still profile needs retuning

### Non-goals
Family/presence sharing (needs a consent model LocationApi doesn't have); geofence alerts; trip polylines as
first-class features; a time-range control on the map; rollup backfill for days the app was down.

## M13 — Photo backup and the gallery   [status: in-progress]

The camera roll becomes part of the estate: the phone backs it up to the object store, geotagged photos
appear on the Map tab, and a Photos tab browses the whole library — including the assets the map can
never show (no EXIF GPS, no matching location history) and the failed uploads that were previously only
findable with psql.

### Scope
- [x] `data/photoQueue.ts` + `photo_upload_queue` migration; MediaStore scan via expo-media-library, WiFi-only default, backup-from date, outbox-style backoff/park
- [x] `sync/photoUploader.ts` — declare → presigned PUT straight to the object store → complete; settings in `data/photoSettings.ts` (mirror_meta) and counters in `sync/photoBackupStatus.ts` (sync must not import state)
- [x] `ACCESS_MEDIA_LOCATION` so EXIF GPS survives the read; Settings shows progress + parked retry
- [x] Photos layer on the Map tab (viewport-scoped, clustered, tap → thumbnail sheet)
- [x] Photos tab: `state/photo-queries.ts` cursor `useInfiniteQuery`, day-grouped `SectionList` 3-up grid, filters/sort sheet, upload-health chip from `GET /photos/stats`
- [x] `PhotoViewerScreen` — horizontally paged over the loaded page (route carries the grid's filters so the query hits the cache), pinch + double-tap zoom, metadata panel, delete, retry processing
- [x] `react-native-gesture-handler` + `react-native-reanimated` (native — rides the pending dev-client build); `GestureHandlerRootView` wraps the app
- [x] Photo↔event links: viewer lists linked events and offers candidates around `takenAt`; `ItemDetailScreen` gains a linked-photos strip
- [x] Duplicate detection: surrogate match at declare + sha256 during processing; duplicates hidden from the grid, reachable by the Duplicate status chip, viewer links to the original
- [x] Map ↔ gallery cross-links: photo pin → Open photo / All from this day; viewer → Show on the map (Map tab's `at` param)
- [x] Suggested photos on an event: `EventPhotosRow` offers what was taken during the event, one tap to link
- [x] Root `npm run typecheck` / `lint` / `test` green

### Exit criteria
- [ ] Garage stood up and lupira-photo-api deployed (the gallery has never seen real data)
- [ ] Authentik: `lupira-photo-aud` mapped onto the `lupira-cal-mobile` provider, then a forced sign-out/in
- [ ] EAS dev-client build (gesture-handler + reanimated are native)
- [ ] Device: back up a photo, watch it reach the grid, open it full-screen, swipe and pinch
- [ ] Device: a photo with no EXIF GPS — invisible on the map — is present and browsable in the gallery
- [ ] Device: airplane mode shows the empty state, never an error; reconnect repopulates
- [ ] Device: link a photo to an event, then find it from the event's Photos strip
- [ ] Device: a Failed asset surfaces on the health chip and Retry processing clears it
- [ ] Device: back the same photo up from two phones — it appears once, the second is reachable under Duplicates
- [ ] Device: a photo pin's "All from this day" filters the gallery to that day; the viewer's "Show on the map" flies to it

### Non-goals
HEIC transcode (originals are served untranscoded, so the viewer falls back to the thumbnail);
favourites/albums; bulk select and download; "on this day" memories; trips as a photo grouping.

## M14 — Device feedback pass   [status: in-progress]

### Scope
- [x] cal-api participation summary carries a recency-weighted `score` (0.5^(age/90 d) per past occurrence, next planned one = 1); both clients rank attendees by it
- [x] New events invite you as going (`me.contactId` from `/contact-api/me`, offline-safe); Join on event detail, Add me in the people sheet
- [x] Place sheet: one ranked list (`placeRank`) incl. contacts' addresses by name; resident line on every row, geocode hits matched within 30 m; localities no longer stored as places
- [x] Address currency: former/future addresses fold away on the contact card and rank last in the picker
- [x] `PlaceTile` + `MiniMap` for event and contact places; tags as quiet text at the bottom; double insets and literal gaps gone
- [x] Calendar remembers Month/Week and the last event's calendars; the week all-day strip scrolls past 30% of the screen
- [x] Map: show-on-map lands at z16 with a pin (first visit included); one age limit over every dated layer; compact layers sheet; tap lists everything on the spot with preview cards; sheets clear the nav bar
- [x] Settings index + four category subscreens; all-day rows picker fits 360 dp
- [x] Map jump strip: your home and work, then the next 5 placed events (tap = fly + pin, an event opens its card)
- [x] Hold an event's name or description, or a contact's name, to copy it
- [x] Hold a place tile or a reach row to copy it (`expo-clipboard` — native, so the next release is a full EAS build, not OTA); attendee chips open the contact card

### Exit criteria
- [x] Root `npm run typecheck` / `lint` / `test` green; cal-api unit + participation integration green
- [ ] Device: new event shows you Going on web; Join from detail
- [ ] Device: place search "Anna" → her home; a hotspot row says who lives there
- [ ] Device: show-on-map from an event on a cold Map tab lands at street level with a pin
- [ ] Device: stacked pins open a list; a photo card's buttons clear the nav bar
- [ ] Device: Month hides older photos/hotspots/track; week/month + last calendar survive kill/relaunch
- [ ] Device: Settings fits 360 dp; a week with 6+ overlapping all-day items scrolls inside the strip

## Split into Lupira Maps and Lupira Photos

The map tab, Photos tab, GPS recording/upload and camera-roll backup (M11–M13) moved to the Lupira Maps and Lupira Photos apps. Cal mobile keeps the event photo strip and the place-tile mini-map, opens the sibling apps through `ui/openSibling`, and drops `photo_upload_queue` / `location_fix_queue` in schema v6.
