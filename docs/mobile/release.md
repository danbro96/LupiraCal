# Lupira Calendar — release & distribution

Same pipeline as LupiraTasksMobile: **EAS build → Play Console internal testing**. EAS owns the
signing key (managed credentials, project `danbro96/lupira-calendar`); Play distributes and
auto-updates the family's installs.

## Versioning

- `eas.json` sets `cli.appVersionSource: remote` + `production.autoIncrement` — EAS bumps
  `versionCode` per production build. `expo.version` in `app.json` is the only human version
  (`APP_VERSION` reads it; `package.json` stays `0.0.0`).
- Settings shows `<version> · dev | embedded | OTA <id>`; Sentry events carry `update_id` and
  `update_channel` tags.
- A rebuild is enough even if `expo.version` is unchanged (Play shows e.g. `1.0.0 (4)`). Bump it
  when the family should see a new number.

## Native release

Push to `release/android` (`.github/workflows/mobile-release.yml`): tests → `eas build --profile
production --auto-submit` to the Play internal track → tag `android/v<version>+<versionCode>`.

```bash
git push origin main:release/android
```

Runs only when the push touches `apps/mobile/**`, `packages/**` or the lockfile. Needs an
`EXPO_TOKEN` repo secret and the Play service-account key linked in EAS credentials. The first
release is manual (Play's API cannot create it): create the app (`com.lupira.calendar`), upload the
AAB from `npx eas-cli build -p android --profile production`, add testers, share the opt-in link.

Sideloadable APK: `npx eas-cli build -p android --profile preview` (from `apps/mobile`).
Monorepo: EAS archives the git root and installs the workspace; the root `.npmrc`
(cooldown + ignore-scripts) applies on the build host.

## OTA update (JS-only)

Run the **mobile-ota** workflow (branch `production` or `preview`, plus a message), or
`eas update --branch production --message "…"`. Running apps check on launch and on foreground
(max once per 5 min) and reload immediately (`useAutoUpdate`). A native change alters the
fingerprint — those need a native release. No Sentry source maps are uploaded for builds or OTA
(no Sentry metro/plugin config), so crash stacks are minified.

## Dev client vs release install

Same package id, different signing keys — they can never be installed over each other.
Switching directions requires an uninstall (mirror data is lost locally but resyncs; **drain
the outbox first**: Sync issues screen must show zero pending/parked). Day-to-day: family
phones run the Play build; the dev client is a development tool.

## Release-build behavior differences

- JS is bundled into the app — no Metro dependency.
- Cleartext HTTP is blocked: the LAN/emulator presets are hidden in release builds
  (Settings shows only https presets + custom).

## Upgrade drill (per release, before promoting)

1. On a device with the previous build: airplane mode → make a few edits (outbox non-empty).
2. Install the new build over it (Play update or `adb install -r` for preview APKs).
3. Reconnect → the queued edits drain and appear on the web. Nothing may be lost — the
   outbox survives upgrades by design (append-only migrations, envelope-versioned ops).
