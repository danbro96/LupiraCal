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
`EXPO_TOKEN` repo secret and the Play service-account key linked in EAS credentials
(`eas credentials -p android`). The first
release is manual (Play's API cannot create it): create the app (`com.lupira.calendar`), upload the
AAB from `npx eas-cli build -p android --profile production`, add testers, share the opt-in link.

Sideloadable APK: `npx eas-cli build -p android --profile preview` (from `apps/mobile`).
Monorepo: EAS archives the git root and installs the workspace; the root `.npmrc`
(cooldown + ignore-scripts) applies on the build host.

## OTA update (JS-only)

Run the **mobile-ota** workflow (branch `production` or `preview`, plus a message): `expo export
--source-maps` → `eas update --skip-bundler --environment <branch>` → `sentry-expo-upload-sourcemaps
dist`. Running apps check on launch and on foreground (max once per 5 min) and reload immediately
(`useAutoUpdate`). A native change alters the fingerprint — those need a native release.

An OTA reaches only installs whose runtime (fingerprint) matches the tree it was exported from.
Fixes for installs still on an older native build go out from that build's `runtime/<version>`
branch (`runtime/1.1.0` = the 1.1.0 tree): run **mobile-ota** with that branch selected as the
workflow ref. Delete the branch once Settings on every device reports the newer version.

## Sentry source maps

Builds and OTAs both upload source maps, so crash stacks symbolicate.

- Build: the `@sentry/react-native/expo` plugin (org `brostrom`, project `lupira-calendar`,
  de.sentry.io) uploads during the EAS build. Each `eas.json` build profile names its EAS
  environment (`development` / `preview` / `production`); `SENTRY_AUTH_TOKEN` must exist in all
  three, or the release build fails at the upload step. Variables on the GitHub runner do not
  reach the EAS build worker. `experimental_android.enableAndroidGradlePlugin` adds the Sentry
  Android Gradle Plugin, which also uploads native debug symbols and the ProGuard mapping.
- OTA: `getSentryExpoConfig` (metro) stamps debug IDs; mobile-ota uploads `dist` with
  `SENTRY_AUTH_TOKEN`.

Secrets: GitHub `EXPO_TOKEN` (both workflows) + `SENTRY_AUTH_TOKEN` (mobile-ota); EAS environment
variable `SENTRY_AUTH_TOKEN` (builds).

## Dev client vs release install

Same package id, different signing keys — they can never be installed over each other.
Switching directions requires an uninstall (mirror data is lost locally but resyncs; **drain
the outbox first**: Sync issues screen must show zero pending/parked). Day-to-day: family
phones run the Play build; the dev client is a development tool.

## Release-build behavior differences

- JS is bundled into the app — no Metro dependency.
- R8 shrinks and obfuscates the Java/Kotlin code. `expo-build-properties` adds keep rules for
  WorkManager's Room database and input mergers (created by reflection; `expo-background-task`
  runs on WorkManager) and for `org.maplibre.reactnative` (the wrapper ships no consumer rules).
- Cleartext HTTP is blocked: the LAN/emulator presets are hidden in release builds
  (Settings shows only https presets + custom).

## Native cutover (1.2.0 → 1.3.0)

1. The SDK 58 work sits on branch `sdk-58`; `main` keeps serving OTAs to 1.2.0 until the 1.3.0
   production build is submitted.
2. Clean-tree `npx expo-updates fingerprint:generate --platform android` differs from 1.2.0's;
   `npx expo export --platform android` bundles.
3. `npx eas-cli build -p android --profile preview` from `sdk-58` → device pass (R8 is on in the
   preview APK too).
4. `npx eas-cli build -p android --profile production --auto-submit` → 1.3.0 on internal, then
   merge `sdk-58` into `main`. OTAs from `main` target 1.3.0 only; 1.2.0 installs move up through
   Play (no `runtime/1.2.0` branch).

## Upgrade drill (per release, before promoting)

1. On a device with the previous build: airplane mode → make a few edits (outbox non-empty).
2. Install the new build over it (Play update or `adb install -r` for preview APKs).
3. Reconnect → the queued edits drain and appear on the web. Nothing may be lost — the
   outbox survives upgrades by design (append-only migrations, envelope-versioned ops).
