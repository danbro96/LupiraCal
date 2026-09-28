---
name: verify
description: Launch the full LupiraCal dev stack and drive the SPA in a headless browser to verify UI changes end-to-end.
---

# Verify LupiraCal changes

Surface = the SPA at http://localhost:5174 (Vite → BFF 5181 → APIs). Dev auth is automatic (BFF injects `X-Dev-User`); no login flow.

## Stack

Check what's already up first: `cal-api 5255`, `geo-api 5260`, `contact-api 5265`, `BFF 5181`, `Vite 5174`. PG runs as docker container `lupira-cal-pg-tmp` (user `lupira_cal_user`, pw `devpassword`, port 5432); create sibling DBs (`lupira_contact`, `lupira_geo`) there if missing — Marten bootstraps schemas on API startup.

Launch missing pieces (background):

```bash
# geo (needs a geocoder for free-text resolve; public Nominatim is fine for a few dev calls)
cd ~/git/LupiraGeoApi/src/LupiraGeoApi && ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:5260 \
  ConnectionStrings__Postgres="Host=localhost;Port=5432;Database=lupira_geo;Username=lupira_cal_user;Password=devpassword" \
  Nominatim__BaseUrl="https://nominatim.openstreetmap.org" dotnet run --no-launch-profile

# contact
cd ~/git/LupiraContactApi/src/LupiraContactApi && ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:5265 \
  ConnectionStrings__Postgres="Host=localhost;Port=5432;Database=lupira_contact;Username=lupira_cal_user;Password=devpassword" \
  dotnet run --no-launch-profile

# SPA
cd ~/git/LupiraCal && npm run dev
```

Smoke: `curl http://localhost:5174/contact-api/address-books` → 200 proves the whole chain.

## Drive

No Playwright in-repo; `npm i playwright-core` in scratchpad and drive system Chromium at `/snap/bin/chromium` headless. First page load auto-bootstraps the contact side (Personal address book) for the dev user.

Gotchas:
- Two "+ New" buttons: topbar (calendar item) vs `.list-pane-head button` (contact). Scope selectors.
- Place typeahead suggests only from the local gazetteer — a fresh geo DB yields zero suggestions; the free-text Resolve fallback geocodes and persists a place, after which typeahead has data.
- Direct API pokes need `-H "X-Dev-User: daniel.brostrom@hotmail.se"` (dev user from BFF appsettings.Development).
