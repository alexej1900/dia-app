# Dish Photo Persistence + Display — Design Spec

Builds on the dish-photo-recognition pipeline (`docs/superpowers/specs/2026-08-08-dish-photo-recognition-design.md`) and the dish-name-suggestions module (`docs/superpowers/specs/2026-09-11-dish-name-suggestions-design.md`, merged as of this writing).

## Purpose

Today, a dish's photo is fully transient: `captureAndRecognizeDishPhoto` resizes it, base64-encodes it, sends it to the Worker for recognition, and then discards it — the local file is never kept, and dishes have no way to remember what they look like. This feature persists that photo alongside the dish and displays it: a thumbnail on each row of `DishesListScreen`, and the full photo at the top of `DishFormScreen` when editing/viewing a dish that has one. Dishes without a photo (manual "+ Add dish", or dishes saved before this feature existed) show a plain placeholder icon — no broken image, no prompt to add one.

## Architecture

```
Photo capture (unchanged) → resized JPEG at a transient cache-ish URI
  → captureAndRecognizeDishPhoto() now returns { recognition: RecognitionResult, photoUri: string }
  → DishFormScreen holds photoUri as pendingPhotoUri (not yet persisted)
  → User taps Save
  → persistDishPhoto(pendingPhotoUri) copies it into Paths.document/dish-photos/<id>.jpg
  → dishesRepo writes the permanent URI into dishes.photo_uri
  → DishesListScreen / DishFormScreen read photo_uri back and render it, or a placeholder icon if null
```

Persistence happens at Save time, not at capture time: the resized photo simply stays wherever `expo-image-manipulator` already writes it (an OS-managed cache location) until Save. If the user cancels the form or backs out without saving, nothing was ever written to permanent storage — there is no orphan-file cleanup to do for that case. This mirrors how the feature was scoped: no new "orphan sweep" job, no extra bookkeeping table.

Only one image file is ever stored per dish (the same ~1024px-capped JPEG already produced during recognition, reused as-is). `DishesListScreen`'s thumbnail and `DishFormScreen`'s larger photo both render this same file at different display sizes via React Native's `Image` component — no separate thumbnail generation step, no second file per dish.

## Schema & migration (`src/db/schema.ts`)

`dishes` gains a nullable `photo_uri TEXT` column:

```sql
CREATE TABLE IF NOT EXISTS dishes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  photo_uri TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`CREATE TABLE IF NOT EXISTS` only helps fresh installs — an existing `dishes` table from before this feature won't gain the column automatically. `migrateSchema` gets a second defensive step, following the exact pattern already used for `dish_items.is_estimated`: check `PRAGMA table_info(dishes)` for `photo_uri`, and only if absent, run `ALTER TABLE dishes ADD COLUMN photo_uri TEXT`. Checking reality via `PRAGMA table_info` (rather than trying the `ALTER` and swallowing a "duplicate column" error) is the established approach in this codebase specifically because matching an error message's exact wording isn't reliable across the different SQLite drivers the app runs on (native `expo-sqlite`, web `wa-sqlite`, `sql.js` in tests) — same reasoning applies unchanged here.

## Repository layer (`src/repositories/dishesRepo.ts`)

Pure DB layer, no filesystem I/O — consistent with today, and required so it stays testable with `sql.js` exactly as-is.

- `DishInput` gains `photoUri: string | null`.
- `Dish` and `DishSummary` gain `photoUri: string | null`.
- `DishRow` gains `photo_uri: string | null`.
- `createDish` / `updateDish`: `INSERT`/`UPDATE` statements include `photo_uri`.
- `getDish` / `listDishes`: map `row.photo_uri` → `photoUri` on the returned objects.

## New service: `src/services/dishPhotoStorage.ts`

Uses `expo-file-system`'s current SDK 57 API (`File`, `Directory`, `Paths` — the object-oriented API; the deprecated legacy string-based API is not used). This is a new dependency and needs adding to `package.json`.

```ts
export async function persistDishPhoto(sourceUri: string): Promise<string>
export async function deleteDishPhoto(uri: string | null | undefined): Promise<void>
```

- `persistDishPhoto`: ensures a `Directory(Paths.document, 'dish-photos')` exists (creating it if `!dir.exists`), copies `sourceUri` into it as `${generateId()}.jpg` (reusing the same ID generator already used elsewhere in the app, e.g. `dishesRepo`), and returns the new `File`'s `uri`. Called only from `DishFormScreen.handleSave`, only when there's a newly captured photo pending.
- `deleteDishPhoto`: best-effort — wraps the delete in try/catch and swallows any error (already-missing file, permission issue). No-op if `uri` is nullish. Called from `handleSave` (cleaning up a replaced photo) and `handleDelete` (cleaning up a deleted dish's photo).

**Platform note:** the new `expo-file-system` API is not supported on web. Unlike the recognition flow's gallery-pick path (verifiable today via `expo start --web` per this project's device-testing notes), photo persistence itself can only be verified on a real device. This project's EAS preview-build workflow already covers that gap.

## Capture pipeline & screen wiring

- **`src/services/dishPhotoCapture.ts`**: `captureAndRecognizeDishPhoto`'s return type changes from `Promise<RecognitionResult>` to `Promise<{ recognition: RecognitionResult; photoUri: string }>`. `photoUri` is the local URI already produced by the existing `rendered.saveAsync(...)` call (currently only its `base64` field is read) — no new capture/resize work, just returning a value that was already being computed and discarded. `RecognitionResult` itself (in `dishRecognition.ts`) is untouched — it's the Worker's response shape and has no business knowing about local files.
- **`src/screens/PhotoRecognitionButton.tsx`**: `onRecognized` prop type changes from `(result: RecognitionResult) => void` to `(result: { recognition: RecognitionResult; photoUri: string }) => void` — it already just forwards whatever `captureAndRecognizeDishPhoto` resolves to.
- **`src/screens/DishFormScreen.tsx`**:
  - New state: `existingPhotoUri: string | null` (loaded from `getDish(...).photoUri` when editing; stays `null` for a new dish) and `pendingPhotoUri: string | null` (set by `handleRecognized` when a fresh photo comes back from either the manual `PhotoRecognitionButton` path or the auto-trigger `runAutoCapture` path — both already funnel into `handleRecognized`).
  - Displayed photo = `pendingPhotoUri ?? existingPhotoUri`, rendered via `Image` at the top of the form, above the Name field. When both are `null`, a plain Ionicons placeholder icon renders instead (the app already depends on `@expo/vector-icons`; `Ionicons` is already used elsewhere, e.g. `RootNavigator.tsx`).
  - `handleRecognized` now destructures `{ recognition, photoUri }`: `setNameSuggestions(recognition.dishNameSuggestions)` and `setPendingPhotoUri(photoUri)`, then navigates to `PhotoReview` with `recognition.items` exactly as `items` is passed today — `PhotoReview` and its matching/unmatched flow are unaffected.
  - `handleSave`: if `pendingPhotoUri` is set, calls `persistDishPhoto(pendingPhotoUri)`.
    - On success: uses the returned permanent URI as `input.photoUri`. If there was a prior `existingPhotoUri` (replacing a photo on an existing dish), calls `deleteDishPhoto(existingPhotoUri)` best-effort *after* the DB write succeeds, to avoid leaving the old file orphaned on disk.
    - On failure: falls back to `input.photoUri = existingPhotoUri` (or `null` for a new dish) and proceeds with the rest of the save — a photo-persistence failure never blocks saving the dish's name/ingredients, matching this feature's "best effort" stance on filesystem errors throughout.
    - If `pendingPhotoUri` is unset (no new capture this session), `input.photoUri = existingPhotoUri` unchanged.
  - `handleDelete`: after `deleteDish` succeeds, calls `deleteDishPhoto(existingPhotoUri)` best-effort.
- **`src/screens/DishesListScreen.tsx`**: each row gains a small `Image` thumbnail on the left when `item.photoUri` is set, else the same Ionicons placeholder, with the existing name/macros text to its right (layout becomes a horizontal row: thumbnail/placeholder, then the existing vertical text stack).

## Error handling

No new error states surfaced to the user. Every filesystem operation this feature adds (`persistDishPhoto` on failure, `deleteDishPhoto` always) is best-effort and fails soft — consistent with the clarifying decisions above. The only visible effect of a filesystem failure is that a dish ends up without a photo (or keeps its old one) instead of gaining/losing one; the dish's core data (name, ingredients, totals) is never at risk from a photo-persistence problem.

## Out of scope (deferred / not planned)

- Any UI to remove/clear a dish's photo independently of replacing it with a new capture — not requested, and the manual "+ Add dish" path never had a photo to remove in the first place.
- Attaching a photo to a dish after the fact via the manual "+ Add dish" path — photos only ever come from the recognition flow, exactly as portion estimates and name suggestions do today.
- Separate thumbnail file generation — deliberately rejected in favor of reusing the single resized image at different display sizes (see Architecture).
- Any orphan-file sweep/garbage-collection job — deferred-at-capture persistence (only writing permanent files at Save time) is specifically designed to make this unnecessary for the cancel-without-saving case; the replace and delete paths clean up their own single old file inline.
- Storing only a filename (resolving the full path at read time) instead of the absolute URI `persistDishPhoto` returns — flagged during the final implementation review: on iOS, the document directory's absolute path contains an app-container UUID that Apple does not guarantee stays constant across app updates (existing app data, including the SQLite DB, does survive updates), so a stored absolute `photo_uri` could theoretically go stale after an update-in-place, showing blank thumbnails for existing photos. Deferred rather than fixed immediately because: the risk could not be verified empirically, it only manifests after this app has real production installs being updated in place (not yet the case — still EAS preview/dev-build testing), and reworking to filename-only storage means touching the already-reviewed `dishPhotoStorage.ts` return contract plus every screen that renders a photo. Revisit before any production/App Store release.

## Testing & verification

- **`__tests__/db/schema.test.ts`**: add `photo_uri` fresh-create and migration cases mirroring the existing `is_estimated` tests (fresh table has the column; a pre-existing `dishes` table lacking it gains it via `migrateSchema`; migration is a no-op when already present).
- **`__tests__/repositories/dishesRepo.test.ts`**: extend create/update/get/list round-trips to cover `photoUri`, including the `null` case for dishes without a photo.
- **New `__tests__/services/dishPhotoStorage.test.ts`**: mock `expo-file-system`'s `File`/`Directory`/`Paths`. Cover: `persistDishPhoto` creates the `dish-photos` directory when it doesn't exist yet, skips creation when it does, copies to a generated filename, and returns the new URI; `deleteDishPhoto` swallows a thrown error and no-ops on `null`/`undefined`.
- **`__tests__/services/dishPhotoCapture.test.ts`**: update existing assertions for the new `{ recognition, photoUri }` return shape (mirrors the migration `dishRecognition`'s tests already went through when `RecognitionResult` was introduced).
- **No new component tests** for `DishFormScreen`/`DishesListScreen` — neither has component-level test coverage today (only their helper modules do, e.g. `dishFormHelpers.test.ts`), and this feature doesn't change that established pattern. Verified via `tsc --noEmit`, the full Jest suite staying green, and a live check on an EAS preview build (per the platform note above, web can't substitute for filesystem persistence) covering: a fresh photo-recognized dish gets a thumbnail in the list and a photo in the form; editing that dish and recapturing a new photo replaces it (and the old file is gone); deleting the dish removes its photo file too; a manually-added dish shows the placeholder icon throughout.
