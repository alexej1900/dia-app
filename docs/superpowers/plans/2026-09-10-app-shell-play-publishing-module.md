# App Shell + Google Play Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the app to CarbSnap, add a crash-safe error boundary, configure EAS build/signing profiles, and produce the documentation (secrets setup, privacy policy, Play Store listing copy) needed for the user to actually build and submit the app to Google Play themselves.

**Architecture:** Five independent, self-contained tasks — an identity rename across `app.json`/`package.json`/`README.md`; a new `ErrorBoundary` component wired into `App.tsx`; a new `eas.json` plus its companion secrets doc; and two standalone documentation deliverables (`docs/privacy-policy.md`, `docs/play-store-listing.md`). No task depends on another task's code (only two docs cross-reference each other's file paths in prose).

**Tech Stack:** Expo/React Native/TypeScript (app), EAS Build/Submit CLI, Jest (existing suite, used only as a regression check — this module adds no new automated tests, see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-09-10-app-shell-play-publishing-design.md`

## Global Constraints

- App name: `CarbSnap` (was `DIA-APP`). Slug: `carbsnap` (was `dia-app`).
- Android package ID: `com.carbsnap.app` (was `com.diaapp.mobile`) — this is permanent once first published to Google Play, so get it right now.
- `app.json`'s `android` block gains `versionCode: 1` (Play Store requires this in addition to `expo.version`).
- Platform target is Android only. iOS is explicitly out of scope for this module.
- No new feature screens (no Settings/About/onboarding screen) — confirmed out of scope with the user.
- No crash-reporting/analytics integration (e.g. Sentry) — nothing in the roadmap calls for it.
- No new branded icon/splash artwork — the existing generated assets in `assets/` stay exactly as they are.
- This module does not touch anything under `worker/` — that's a separate npm project, already deployed-or-not independently of this module, and renaming its Cloudflare-side identity is out of scope.
- EAS signing uses the EAS-managed keystore (the default/standard path) — no local keystore files, no manual signing config.
- `eas.json` gets exactly two build profiles, `preview` and `production` — no `development` profile (there's no device/emulator in this dev environment to use a dev client with).
- The privacy policy is hosted via GitHub Pages and written as plain Markdown at `docs/privacy-policy.md` (GitHub Pages renders Markdown automatically via its default Jekyll theme — no extra config needed).
- This module adds **no new automated tests**. `ErrorBoundary` cannot be unit-tested without adding RN rendering test infrastructure (confirmed empirically during planning: `import { View } from 'react-native'` inside a Jest test fails under this project's Node-based Jest config with `SyntaxError: Cannot use import statement outside a module`, since nothing transforms `node_modules/react-native`), and its only logic is too trivial to be worth extracting into a pure file just to have something to test. Every task is instead verified via `npx tsc --noEmit` staying clean and, where relevant, `npx jest` as a regression check.
- Work happens on the current branch (`module-5-app-shell-play-publishing`), not `main`.

---

## File Structure

- **Modify** `app.json` — name/slug/package rename, add `android.versionCode`.
- **Modify** `package.json` — `name` field rename to match.
- **Modify** `README.md` — title rename to match.
- **Create** `src/ErrorBoundary.tsx` — class component catching render errors, showing a static fallback instead of a blank screen.
- **Modify** `App.tsx` — wrap `RootNavigator` with `ErrorBoundary`.
- **Create** `eas.json` — `preview` (APK) and `production` (AAB, auto-incrementing version code) build profiles, EAS-managed signing.
- **Create** `docs/eas-secrets.md` — which env vars to set on which EAS profile, and where their values come from.
- **Create** `docs/privacy-policy.md` — the Play-Store-required privacy policy page.
- **Create** `docs/play-store-listing.md` — drafted Play Console listing copy and an asset checklist.

---

### Task 1: App identity rename

**Files:**
- Modify: `app.json`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the app's canonical identity (`CarbSnap` / `carbsnap` / `com.carbsnap.app`). Task 3's `eas.json` and `docs/eas-secrets.md`, and Task 5's `docs/play-store-listing.md`, all reference "CarbSnap" as the app name in their prose — written that way directly, not derived from this task's files at build time, so there's no runtime dependency, just a naming consistency to keep in mind.

- [ ] **Step 1: Update `app.json`**

Replace the full contents of `app.json`:

```json
{
  "expo": {
    "name": "CarbSnap",
    "slug": "carbsnap",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "android": {
      "package": "com.carbsnap.app",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundColor": "#ffffff"
      }
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow $(PRODUCT_NAME) to access your photos to recognize dish ingredients.",
          "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera to photograph a dish.",
          "microphonePermission": false
        }
      ]
    ]
  }
}
```

(Only `name`, `slug`, `android.package`, and the new `android.versionCode` changed from the current file — everything else, including the `expo-image-picker` plugin config, is unchanged.)

- [ ] **Step 2: Update `package.json`'s `name` field**

In `package.json`, change only the top-level `"name"` field from `"dia-app"` to `"carbsnap"`. Every other field (dependencies, scripts, the `jest` config block) stays exactly as-is.

- [ ] **Step 3: Update `README.md`**

Replace the full contents of `README.md` (currently just `# dia-app`):

```markdown
# CarbSnap
```

- [ ] **Step 4: Sync the lockfile**

Run: `npm install`

This regenerates `package-lock.json`'s top-level `name` field to match `package.json` (npm does this automatically; do not hand-edit `package-lock.json`).

- [ ] **Step 5: Verify**

Run: `node -e "JSON.parse(require('fs').readFileSync('app.json', 'utf8')); console.log('app.json is valid JSON')"`
Expected: prints `app.json is valid JSON` with no error.

Run: `npx tsc --noEmit`
Expected: no errors (this change touches no TypeScript, so this just confirms nothing else broke).

Run a search for any remaining reference to the old identity outside historical spec/plan docs (which intentionally describe the state as it was at the time and must NOT be edited):

Run: `grep -rEn "com\.diaapp\.mobile|dia-app|DIA-APP" --include="*.json" --include="*.ts" --include="*.tsx" --include="*.md" . 2>/dev/null | grep -v node_modules | grep -v "docs/superpowers" | grep -v "worker/" | grep -v package-lock.json`
Expected: no output (empty). If anything prints, it's a stale reference outside the intentionally-excluded historical docs/lockfile/worker — track it down and fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add app.json package.json package-lock.json README.md
git commit -m "feat: rename app to CarbSnap (com.carbsnap.app)"
```

---

### Task 2: Error boundary

**Files:**
- Create: `src/ErrorBoundary.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: nothing new (wraps the existing default export of `src/navigation/RootNavigator.tsx`, already imported in `App.tsx`).
- Produces: `ErrorBoundary` (default export from `src/ErrorBoundary.tsx`), a React component taking `{ children: React.ReactNode }`. No other task consumes this export.

- [ ] **Step 1: Create `src/ErrorBoundary.tsx`**

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.message}>Something went wrong. Please restart the app.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { fontSize: 16, textAlign: 'center', color: '#333' },
});
```

- [ ] **Step 2: Wrap `RootNavigator` in `App.tsx`**

Replace the full contents of `App.tsx`:

```tsx
import React from 'react';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <RootNavigator />
    </ErrorBoundary>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx jest`
Expected: all suites still passing (regression check — this codebase has no test that imports `App.tsx` or `ErrorBoundary.tsx`, since neither can be imported under this project's Node-based Jest config without a React Native transform; this run only confirms nothing pre-existing broke).

- [ ] **Step 4: Commit**

```bash
git add src/ErrorBoundary.tsx App.tsx
git commit -m "feat: add error boundary around the app shell"
```

---

### Task 3: EAS build & signing configuration

**Files:**
- Create: `eas.json`
- Create: `docs/eas-secrets.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by another task's code — `docs/eas-secrets.md` is a standalone reference doc for the user.

- [ ] **Step 1: Create `eas.json`**

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

- [ ] **Step 2: Create `docs/eas-secrets.md`**

```markdown
# EAS Environment Variables

CarbSnap's dish-photo recognition feature needs two environment variables baked into
the app at build time. They are **not** committed to git (see `.env.example` for local
development) and must be set as EAS environment variables before running a `preview` or
`production` build via `eas build`.

## Variables

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_RECOGNITION_API_URL` | The deployed Cloudflare Worker's `/recognize` endpoint URL. |
| `EXPO_PUBLIC_RECOGNITION_API_SECRET` | The shared secret the Worker checks on every request (same value as the Worker's `APP_SHARED_SECRET`). |

Both variable names start with `EXPO_PUBLIC_`, which means Expo bakes their values into
the JavaScript bundle at build time — they are not server-side secrets, just a
deterrent header (see `docs/superpowers/specs/2026-08-08-dish-photo-recognition-design.md`
for why). Treat them as build inputs, not as something requiring extra secrecy beyond
"don't commit them to git."

## Getting the values

You need a deployed Cloudflare Worker first. Follow `worker/README.md` end to end —
it walks through setting the Worker's own secrets and deploying it, and ends with the
exact `EXPO_PUBLIC_RECOGNITION_API_URL` / `EXPO_PUBLIC_RECOGNITION_API_SECRET` values to
use here.

## Setting them in EAS

Run this once per variable, per build profile that needs it (`preview` and
`production`, both defined in `eas.json`):

```
eas env:create --environment preview --name EXPO_PUBLIC_RECOGNITION_API_URL --value "https://your-worker.your-subdomain.workers.dev/recognize" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_RECOGNITION_API_SECRET --value "<your APP_SHARED_SECRET value>" --visibility sensitive

eas env:create --environment production --name EXPO_PUBLIC_RECOGNITION_API_URL --value "https://your-worker.your-subdomain.workers.dev/recognize" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_RECOGNITION_API_SECRET --value "<your APP_SHARED_SECRET value>" --visibility sensitive
```

(Use `--visibility sensitive` for the secret so it's masked in build logs; the URL isn't
sensitive, so `plaintext` is fine for it.) You can also set these from the Expo dashboard
under your project's Environment Variables page instead of the CLI — same effect.

Once set, `eas build --profile preview --platform android` and
`eas build --profile production --platform android` will both have these values
available at build time.

## First-time EAS setup

This repo has no `extra.eas.projectId` in `app.json` yet — that gets written
automatically the first time you run `eas init` (or your first `eas build`) from your
own Expo account. Signing uses an EAS-managed keystore by default; you'll be walked
through creating it interactively on your first production build.
```

- [ ] **Step 3: Verify**

Run: `node -e "JSON.parse(require('fs').readFileSync('eas.json', 'utf8')); console.log('eas.json is valid JSON')"`
Expected: prints `eas.json is valid JSON` with no error.

Run: `npx tsc --noEmit`
Expected: no errors (this change touches no TypeScript).

- [ ] **Step 4: Commit**

```bash
git add eas.json docs/eas-secrets.md
git commit -m "feat: add EAS build/signing configuration and secrets doc"
```

---

### Task 4: Privacy policy

**Files:**
- Create: `docs/privacy-policy.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the file path `docs/privacy-policy.md`, referenced by name (in prose, not code) from Task 5's `docs/play-store-listing.md`.

- [ ] **Step 1: Create `docs/privacy-policy.md`**

```markdown
# Privacy Policy

_Last updated: 2026-09-10_

CarbSnap ("the app") is a mobile app that helps people with diabetes estimate the
carbohydrate content of a meal from a photo. This page explains what data the app
handles and how.

## What the app collects

**Dish photos.** When you use the "photograph a dish" feature, the photo you take or
choose is sent to the app developer's own server (a Cloudflare Worker), which forwards
it to Anthropic's Claude API to identify ingredients and estimate portion sizes. The
photo is used only to generate that one recognition result and is not stored by the
app developer beyond what's needed to process the request.

**Everything else stays on your device.** Your product database, dish records, carb
values, and any notes about which ingredient weights were AI-estimated vs. manually
verified are stored locally on your device only, using an on-device database. None of
this is transmitted anywhere, backed up to any server, or accessible to the app
developer.

## What the app does NOT do

- No user accounts, sign-in, or registration.
- No analytics, advertising, or third-party trackers of any kind.
- No collection of your name, email, location, or any other personal identifier.
- No health data is transmitted to the app developer — dish/carb records never leave
  your device.

## Permissions

The app requests **camera** and **photo library** access solely so you can photograph
or select a picture of a dish to be analyzed. These permissions are not used for any
other purpose.

## Third-party services

Dish photos are processed by [Anthropic](https://www.anthropic.com/legal/privacy)'s
Claude API, via the app developer's own server. No other third-party service receives
any data from the app.

## Data retention and deletion

Since all of your data (other than a dish photo at the moment you submit it for
recognition) lives only on your device, uninstalling the app deletes it. There is no
server-side account or record to separately request deletion of.

## Changes to this policy

If this policy changes, the update will be posted here with a new "Last updated" date.

## Contact

Questions about this policy: [contact email]
```

- [ ] **Step 2: Verify**

Read the file back and confirm: no `TBD`/`TODO` markers other than the intentional `[contact email]` placeholder (which the user fills in), and every factual claim in it (what's local-only, what's sent to the Worker/Anthropic, the two permissions requested) matches the actual current behavior described in `docs/superpowers/specs/2026-08-08-dish-photo-recognition-design.md` and `docs/superpowers/specs/2026-09-08-total-carb-calculation-design.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/privacy-policy.md
git commit -m "docs: add privacy policy for Play Store listing"
```

---

### Task 5: Play Store listing copy

**Files:**
- Create: `docs/play-store-listing.md`

**Interfaces:**
- Consumes: `docs/privacy-policy.md`'s file path (Task 4, referenced in prose only).
- Produces: nothing consumed by another task.

- [ ] **Step 1: Create `docs/play-store-listing.md`**

```markdown
# Play Store Listing

Drafted copy and asset checklist for CarbSnap's Google Play Console listing. Paste the
text sections directly into Play Console's "Store listing" page; fill in the asset
checklist once real screenshots exist (needs a real device or emulator, which this
project's current dev environment doesn't have).

## App name

CarbSnap

## Short description (max 80 characters)

Photograph a meal, get an AI carb estimate to help plan your insulin dose.

_(79 characters)_

## Full description (max 4000 characters)

CarbSnap helps people with diabetes estimate the carbohydrate content of a meal by
photographing it.

Point your camera at a plate of food, and CarbSnap identifies the ingredients, estimates
their portion sizes, and calculates the total carbohydrate content — in grams and in
"W" units (10g of carbohydrate per W) — to help you plan an insulin dose.

Key features:
- Photograph a dish and get an AI-estimated ingredient and carb breakdown
- Build your own local database of products and dishes with known carb values
- Every dish shows a clear warning when its total includes an unverified AI estimate,
  so you always know whether a number is a guess or something you've confirmed yourself
- All of your product, dish, and carb data stays on your device — nothing is uploaded
  or shared, except the dish photo itself, which is sent only to power the recognition
  feature

What CarbSnap does NOT do:
- CarbSnap does not calculate an insulin dose. It estimates carbohydrate content only.
  Any dosing decision is yours (and your care team's) to make.
- CarbSnap is not a substitute for professional medical advice, diagnosis, or
  treatment. Always consult your doctor or diabetes care team about your insulin
  regimen.

CarbSnap works fully offline for everything except the photo-recognition step, which
needs an internet connection to reach the recognition service.

## Suggested category

Medical, or Health & Fitness — confirm which fits better once you see Play Console's
content-rating and data-safety flow for each, since the category choice affects both.

## Privacy policy URL

Link to the page published from `docs/privacy-policy.md` once GitHub Pages is enabled
for this repo (repo Settings → Pages — a one-time manual step; see `docs/eas-secrets.md`
for the related EAS setup step).

## Asset checklist (fill in once available)

- [ ] App icon — 512 × 512 px, 32-bit PNG with alpha
- [ ] Feature graphic — 1024 × 500 px, JPG or 24-bit PNG (no alpha)
- [ ] Phone screenshots — at least 2, up to 8; 16:9 or 9:16 aspect ratio, min 320px on
      the short edge, max 3840px on the long edge
- [ ] (Optional) Tablet screenshots, if a tablet layout is ever verified

## Content rating & data safety

Both are filled in directly inside Play Console (they're interactive questionnaires,
not free text) — not something to draft here. Use the "What the app collects" section
of `docs/privacy-policy.md` as the source of truth when answering Play Console's Data
Safety form: the only data point leaving the device is the dish photo sent for
recognition; everything else is local-only.
```

- [ ] **Step 2: Verify**

Read the file back and confirm: the short description is at or under 80 characters (count it), the full description is well under the 4000-character limit, and both cross-references (`docs/privacy-policy.md`, `docs/eas-secrets.md`) point at files that actually exist in this repo by the time this task runs.

- [ ] **Step 3: Commit**

```bash
git add docs/play-store-listing.md
git commit -m "docs: add Play Store listing copy and asset checklist"
```

---

## Post-plan verification (not a task — do after Task 5)

Run `npx tsc --noEmit` and `npx jest` at the repo root, both green. This module touches no `worker/` code, so the worker's own `npx vitest run` is unaffected and doesn't need re-verification. Everything produced by Tasks 3-5 (`eas.json`, the three new docs) has no automated test surface by design (see Global Constraints) — final verification of those is a human read-through for accuracy, plus (entirely outside this repo, and outside what this plan can execute) the user actually running `eas build`, enabling GitHub Pages, and working through Play Console themselves.
