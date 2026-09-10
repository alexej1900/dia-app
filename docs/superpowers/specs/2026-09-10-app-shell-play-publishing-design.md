# App Shell + Google Play Publishing — Design Spec

Module 5 (final module) of the DIA-APP roadmap. Builds on Modules 1-4, all merged (see `docs/superpowers/specs/2026-08-06-carb-database-design.md`, `2026-08-08-dish-photo-recognition-design.md`, `2026-08-25-portion-estimation-design.md`, `2026-09-08-total-carb-calculation-design.md`).

## Purpose

The roadmap describes this module as "platform choice, packaging, store listing infrastructure." Platform choice is settled: Android only, via Google Play (iOS may follow later but is explicitly out of scope here). The tab-navigator app shell (Products/Dishes tabs, all screens) already exists from Modules 1-4 — this module is not building a shell from scratch.

What this module actually delivers, in scope order:

1. **App shell polish** — the handful of things a real release needs that "it works in dev" doesn't require: an error boundary (today an uncaught render error shows a blank white screen with no recovery), correct app identity (name, package ID, version code) before anything is ever published.
2. **EAS build & signing configuration** — no `eas.json` exists yet; this adds build profiles and a signing strategy.
3. **Production secrets handling** — a documented path for getting the Worker URL/secret into EAS builds without committing them.
4. **Store listing infrastructure** — a privacy policy (mandatory once the app requests camera permission) and drafted Play Console listing copy.

**Explicitly not in scope:** new feature screens (no Settings/onboarding/About screen — confirmed with the user), actually running `eas build`/`eas submit` (needs the user's Expo account login, which this environment doesn't have), creating/owning the Google Play Developer account, Play Console's content-rating and data-safety questionnaires (manual, one-time, done inside Play Console itself), real device screenshots (no Android SDK/emulator in this dev environment — a carried-forward constraint from every prior module), crash-reporting integration (e.g. Sentry — nothing in the roadmap calls for it, and it's its own account/setup decision).

## Decisions made with the user

- **App name:** `CarbSnap` (was the placeholder `DIA-APP`).
- **Android package ID:** `com.carbsnap.app` (was `com.diaapp.mobile`) — changed now because it becomes permanent the moment the app is first published, and nothing has been published yet.
- **Privacy policy hosting:** GitHub Pages, built from this repo.

## Part A: App shell polish

### `app.json` changes

- `expo.name`: `"DIA-APP"` → `"CarbSnap"`
- `expo.slug`: `"dia-app"` → `"carbsnap"`
- `expo.android.package`: `"com.diaapp.mobile"` → `"com.carbsnap.app"`
- `expo.android.versionCode`: add `1` (Play Store requires this; `expo.version` alone, currently `"1.0.0"`, isn't sufficient for Android)
- No changes to icons/splash — the existing generated assets stay wired up as-is; this module doesn't produce new branded artwork.
- No `extra.eas.projectId` is added by hand — that field is written automatically the first time the user runs `eas init` from their own machine (it requires their Expo account). Adding a fabricated placeholder value would be actively wrong (EAS validates it against a real project), so it's left absent with a note in the setup doc instead.

### Error boundary

A new `src/ErrorBoundary.tsx`: a class component (the only way to catch render errors in React) implementing `getDerivedStateFromError`/`componentDidCatch`, rendering a plain fallback view on error — a short message ("Something went wrong. Please restart the app.") — instead of a blank screen. `getDerivedStateFromError` is written as the sole piece of decision logic (error in, new state out) so it stays unit-testable with plain Jest despite this codebase having no React Native rendering test environment (see Testing & verification below). `App.tsx` wraps `RootNavigator` with it:

```tsx
export default function App() {
  return (
    <ErrorBoundary>
      <RootNavigator />
    </ErrorBoundary>
  );
}
```

No programmatic restart button — that needs `expo-updates` or a native-restart package, neither installed, and adding one is out of scope for a fallback screen whose job is just "don't show a blank white screen." `componentDidCatch` logs the error via `console.error` only; no crash-reporting service, per the out-of-scope list above.

## Part B: EAS build & signing configuration

### `eas.json`

Two build profiles — no `development` profile, since there's no device/emulator in this environment to use a dev client with, and adding one now would be speculative:

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      },
      "channel": "preview"
    },
    "production": {
      "autoIncrement": "versionCode",
      "android": {
        "buildType": "app-bundle"
      },
      "channel": "production"
    }
  },
  "submit": {
    "production": {}
  }
}
```

- `preview` produces a directly-installable `.apk`, meant for Play Console's **internal testing track** and ad hoc sideload testing.
- `production` produces a Play-Store-required `.aab` and auto-increments `versionCode` on every build via `appVersionSource: "remote"` (EAS tracks the counter itself), so the user never hand-edits `app.json`'s version code before a release build.
- `submit.production` is an empty object deliberately — `eas submit` will prompt interactively for Play Console service-account credentials the first time the user runs it; no credentials are or can be supplied by this module.

### Signing

EAS-managed keystore — the standard, lowest-friction path. EAS generates and custodies the Android upload key; Google Play App Signing manages the app signing key on Google's side. This requires no configuration in `eas.json` beyond having a `production` Android profile (already above); the user is walked through it interactively the first time they run `eas build --profile production --platform android` from their own logged-in Expo account.

## Part C: Production secrets handling

The app already reads `EXPO_PUBLIC_RECOGNITION_API_URL` and `EXPO_PUBLIC_RECOGNITION_API_SECRET` at build time (Module 2's pattern — baked into the JS bundle, matching that the "secret" is a deterrent header, not real security, per the existing design). For EAS builds these must exist as **EAS environment variables** tied to the `preview`/`production` profiles (via `eas env:create` or the Expo dashboard), not committed to git and not something this module can set — their values depend on the user's actually-deployed Cloudflare Worker (`worker/README.md`), which is itself still an open manual step from Module 2.

A new `docs/eas-secrets.md` documents exactly which two variables to set, on which profiles, and points back to `worker/README.md` for how to obtain their values.

## Part D: Store listing infrastructure

### Privacy policy

A static page at `docs/privacy-policy.md` — plain Markdown, since GitHub Pages renders it automatically via its default Jekyll theme with no extra configuration — covering, in plain language:

- What's collected: dish photos, sent to the user's own Cloudflare Worker and forwarded to Claude's vision API for ingredient/carb recognition (Module 2); everything else (products, dishes, carb values, the estimated-vs-verified flag) stored only locally on-device via SQLite (Modules 1-4) and never transmitted anywhere.
- No accounts, no analytics, no third-party trackers, no PII collected by the app itself.
- A contact point — left as a placeholder (`[contact email]`) for the user to fill in, since this agent doesn't have one to put there.
- A note that camera/photo-library access is used solely to let the user photograph a dish for recognition, matching the permission-usage strings already declared in `app.json`'s `expo-image-picker` plugin config.

Enabling GitHub Pages itself (repo Settings → Pages) is a one-time manual step for the user — this module produces the page content, not the hosting toggle.

### Listing copy

A new `docs/play-store-listing.md` with drafted, ready-to-paste text:

- Short description (≤80 characters, Play Console's limit)
- Full description (up to 4000 characters) — covering the core pitch (photograph a dish, get an AI-estimated carb count in grams and the user's custom "W" unit), what it does NOT do (no insulin dose calculation, no medical advice — important to state explicitly given the health-adjacent nature of the app), and that it works fully offline except for the photo-recognition step.
- Suggested category: **Medical** or **Health & Fitness** — noted as a suggestion for the user to confirm, since Play Console's category choice interacts with its content-rating and data-safety flows in ways only fully visible inside the console itself.

### Screenshots / feature graphic

Not produced by this module — no Android SDK/emulator means no real device screenshots exist to capture. `docs/play-store-listing.md` notes the required asset dimensions (icon 512×512, feature graphic 1024×500, phone screenshots) as a checklist for the user to fill in once they can run the app on a real device or emulator.

## Error handling

The error boundary (Part A) is the only new error-handling surface this module introduces, and it's deliberately minimal: catch, show a static fallback, log to console. No new error paths exist in the packaging/publishing pieces (Parts B-D) since those are configuration and documentation, not runtime code.

## Testing & verification

- **Unit tests:** this codebase has no React Native rendering test environment (`testEnvironment: "node"`, no `jest-expo`/`@testing-library/react-native`/`react-test-renderer` — consistent with the established pattern from prior modules of putting testable logic in pure files rather than testing screen/component rendering directly). Adding that infrastructure is out of scope for this module. Instead, `ErrorBoundary.getDerivedStateFromError` — a static method, pure input-to-state-output — is unit-tested directly with plain Jest (call it with an `Error`, assert the returned state), without rendering anything. The `render()` method itself (choosing fallback vs. `children`) is simple enough to verify by inline reading and via the manual/`expo start --web` spot-check below, matching how every other screen component in this codebase is verified.
- **Everything else in this module (`app.json`, `eas.json`, docs) has no automated test surface** — verified by `npx tsc --noEmit` staying clean (confirms `app.json`/`eas.json` are at minimum syntactically compatible with what Expo's config loader expects) and by manual review of the generated docs for accuracy against the actual codebase (correct env var names, correct existing file paths, etc.).
- **What can't be verified in this environment, carried forward from every prior module:** no Android SDK/emulator means the actual `eas build` output, the signing flow, and the real Play Console submission are never exercised here — the user runs and verifies those themselves, using the docs this module produces as the guide.

## Out of scope (deferred / not planned)

- New feature screens (Settings/About/onboarding) — confirmed with the user as out of scope for this module.
- iOS packaging — platform target is Android-only for now; iOS "maybe later" per the user, to be its own future scope decision if pursued.
- Crash-reporting/analytics integration (Sentry or similar).
- Actually running `eas build`/`eas submit`, creating the Google Play Developer account, or completing Play Console's content-rating/data-safety questionnaires — all require the user's own credentials/accounts and happen outside this codebase.
- Real store-listing screenshots and feature graphic artwork — requires a real device/emulator this environment doesn't have.
- New branded icon/splash artwork — the existing generated assets are kept as-is.
