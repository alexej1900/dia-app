# Total Carb Calculation — Design Spec

Module 4 of the DIA-APP roadmap (see `docs/superpowers/specs/2026-08-06-carb-database-design.md` for Module 1, `docs/superpowers/specs/2026-08-08-dish-photo-recognition-design.md` for Module 2, and `docs/superpowers/specs/2026-08-25-portion-estimation-design.md` for Module 3, all merged and all of which this module builds on).

## Purpose

The roadmap describes this module as "combines (2)+(3)+(1) into a final carb estimate for the dish." In practice, `DishFormScreen` already does this live today — recognized ingredients (Module 2), prefilled portion estimates (Module 3), and the carb database (Module 1) already flow into a running total via `dishTotals()`. What's actually missing, and what this module adds, is two things:

1. **A photo-first entry point.** Today the camera button only appears once a dish is already open for editing (you must tap "+ Add dish" first). This module adds a direct "photograph a dish" path from the dish list, matching the app's core pitch (point the camera at a dish, get a carb estimate) instead of burying it inside manual dish creation.
2. **Closing a gap Module 3 explicitly deferred:** the "this was an AI estimate" flag exists only in the dish form's in-memory state and is lost the moment a dish is saved — a saved dish's total can't be distinguished from one built entirely from verified weights. Since this module is what makes a dish's total "final" for dosing purposes, it persists that flag and surfaces it wherever a total is shown.

## Part A: Photo-first entry flow

### Architecture

```
DishesListScreen: new "📷 Photograph a dish" button
  -> navigation.navigate('DishForm', { autoTriggerPhoto: true })
DishFormScreen (mounts with autoTriggerPhoto param):
  -> on mount, immediately shows a native Alert.alert chooser: "Take Photo" / "Choose from Gallery" / "Cancel"
  -> chosen source runs the same pick -> resize -> recognize pipeline PhotoRecognitionButton already uses
  -> results flow into the existing handleRecognized -> PhotoReview -> addIngredient path, unchanged
  -> Cancel leaves the user on the (now-visible) blank DishForm, same as opening it manually
```

The pick/resize/recognize pipeline currently lives entirely inside `PhotoRecognitionButton.tsx` (permission request, `expo-image-picker` launch, `expo-image-manipulator` resize, the call to `recognizeDish`). It's extracted into a shared function, `captureAndRecognizeDishPhoto(source: 'camera' | 'gallery'): Promise<RecognizedItem[]>`, in a new `src/services/dishPhotoCapture.ts`. Both the existing button and the new auto-trigger path call this identical function — `PhotoRecognitionButton` becomes a thin UI wrapper around it (two buttons, each calling the shared function for a fixed source and forwarding results to `onRecognized`).

This design deliberately reuses `DishForm` as the landing screen rather than introducing a dedicated new screen: everything Module 2/3 already built (`PhotoReviewScreen`, the `pendingUnmatchedNames` unmatched-item detour, the estimate prefill) keeps working with zero changes. The only new pieces are the entry button, the `autoTriggerPhoto` route param, and the auto-fired native chooser.

### UI

`DishesListScreen` gets a second button alongside the existing "+ Add dish", styled consistently with it: "📷 Photograph a dish". On tap, it navigates straight to `DishForm` with `{ autoTriggerPhoto: true }` — no dish name is required upfront, matching today's existing validation (name is only required at Save time).

## Part B: Persisting the estimated flag

### Schema

`dish_items` gains `is_estimated INTEGER NOT NULL DEFAULT 0`. There's no migration system today — `schema.ts` only runs `CREATE TABLE IF NOT EXISTS`, which doesn't add columns to an already-existing table. The column is added to the `CREATE TABLE` statement for fresh installs, plus a defensive, idempotent `ALTER TABLE dish_items ADD COLUMN is_estimated INTEGER NOT NULL DEFAULT 0` (swallowing the "duplicate column" error) run once at DB open in `database.ts`, so already-existing local dev databases pick up the column too.

### Repository layer (`dishesRepo.ts`)

- `DishItemInput` gains `isEstimated: boolean`.
- `DishItem` gains `isEstimated: boolean`.
- `replaceItemsRaw`'s `INSERT` and `loadItems`'s `SELECT` are extended to write/read the `is_estimated` column, converting `boolean <-> 0/1` the same way `is_seed` already does on `products`.

### Calculation layer (`carbs.ts`)

- `DishItemForCalc` gains `isEstimated: boolean`.
- `DishTotals` gains a computed `hasEstimatedItems: boolean` (`items.some(i => i.isEstimated)`) — pure and unit-testable, matching the module's existing calculation pattern.

### Wiring

- `DishFormScreen.handleSave` includes each item's `isEstimated` in the save payload passed to `createDish`/`updateDish`.
- The dish-loading effect (which today hardcodes `isEstimated: false` for every loaded item — a Module 3 leftover that only handled the in-session case) now reads the persisted value instead.

### Surfacing it

- `DishFormScreen`'s totals line shows a muted warning note when `totals.hasEstimatedItems` is true — e.g. "⚠ includes unverified estimates" — in amber (`#b26a00`), a warning tone distinct from the existing error red (`#c62828`) and success green (`#2e7d32`).
- `DishesListScreen`'s list rows get the same signal: `DishSummary` gains `hasEstimatedItems: boolean`, computed the same way in `listDishes`, and rendered as a small flag next to the row's existing weight/carbs/W detail line — so the estimate status is visible wherever a dish's total appears, not just while actively editing it.

## Error handling

The auto-triggered chooser reuses the exact same permission/error paths `PhotoRecognitionButton` already has: denied camera/gallery permission → "Camera/photo access is needed for this feature."; network/timeout/malformed-response → the existing `DishRecognitionError` messages surfaced inline. Tapping "Cancel" on the native chooser is not an error condition — it simply leaves the user on the blank `DishForm`, identical to navigating there manually. No new error states are introduced by either part of this module.

## Testing & verification

- **Unit tests** (Jest, extending existing suites): `captureAndRecognizeDishPhoto` (the extracted pipeline) tested with fixtures, mirroring how the pick/resize/recognize logic is implicitly covered today via `dishRecognition.test.ts`; the schema migration (column present after opening a fresh DB, and after opening a pre-existing DB that predates the column); the repository's `isEstimated` read/write round-trip; `dishTotals`'s new `hasEstimatedItems` computation.
- **Manual/E2E verification** carries the same open constraint as Modules 2-3: no deployed Cloudflare Worker or live Anthropic API key exists in this dev environment, so only the gallery-pick half of the auto-trigger path (not native camera capture) is verifiable via `expo start --web` + chrome-devtools MCP, consistent with prior modules.

## Out of scope (deferred / not planned)

- Native camera capture verification (pre-existing gap carried from Module 2, not newly introduced here).
- Any insulin-dose calculation itself — no dose formula (insulin:carb ratio, correction factor, etc.) exists anywhere in the 5-module roadmap; this module produces a carb/W total, not a dose. If dose calculation is wanted, it would be a new, separate scope decision.
- A dedicated "review estimated items before saving" confirmation gate beyond the existing inline per-row edit affordance and the new summary-level warning note.
- Backfilling `is_estimated` for dishes saved before this module (there are none in production — the app is pre-launch, per Module 5 still being pending — so no backfill migration is needed; existing local dev dishes simply default to `is_estimated = 0` via the column's `DEFAULT 0`).
