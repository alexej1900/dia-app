# Dish Photo Persistence + Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dish's photo, currently discarded right after recognition, is copied into permanent storage when the dish is saved, and displayed as a thumbnail on each `DishesListScreen` row and as a full photo at the top of `DishFormScreen`. Dishes without a photo show a plain placeholder icon.

**Architecture:** A new nullable `dishes.photo_uri` column stores the persisted photo's URI. A new service, `src/services/dishPhotoStorage.ts`, wraps `expo-file-system`'s current object-oriented API (`File`/`Directory`/`Paths`) to copy a photo into the app's document directory and to best-effort delete one later. Persistence happens only at Save time — the resized photo simply stays at its existing transient cache location until then, so there's nothing to clean up if the user cancels. `captureAndRecognizeDishPhoto` starts returning that transient local URI alongside the existing recognition result so `DishFormScreen` has something to persist. No Worker changes, no new screens, no new network calls.

**Tech Stack:** Expo/React Native/TypeScript (app only), `expo-file-system` (new dependency, SDK 57 object-oriented API), Jest (tests).

**Spec:** `docs/superpowers/specs/2026-09-11-dish-photo-persistence-design.md`

## Global Constraints

- Photo persistence happens only at Save time (`persistDishPhoto`, called from `DishFormScreen.handleSave`), never at capture time — no orphan-file cleanup logic is needed or added, per the design spec.
- Every filesystem operation this feature adds is best-effort/fail-soft: a failed `persistDishPhoto` at Save time never blocks saving the dish's name/ingredients (falls back to the dish's existing photo, or none); `deleteDishPhoto` always swallows its own errors.
- Only one image file is stored per dish; no separate thumbnail file is generated — `DishesListScreen`'s thumbnail and `DishFormScreen`'s photo both render the exact same file via `Image`, just at different sizes.
- `dishes.photo_uri` is nullable. Its migration for pre-existing databases follows the exact `PRAGMA table_info` check-then-`ALTER TABLE` pattern already used for `dish_items.is_estimated` in `src/db/schema.ts` — not a try/catch around the `ALTER`.
- `expo-file-system`'s current object-oriented API (`File`, `Directory`, `Paths`, imported from `'expo-file-system'`) is used, never the deprecated legacy string-based API. On that API: `File`/`Directory`'s `create()` and `delete()` are synchronous (`void`); `File.prototype.copy()` is asynchronous (`Promise<void>`).
- This API has no web support. Unlike the recognition flow's gallery-pick path, photo persistence itself can only be verified on a real device (this project's EAS preview-build workflow), not via `expo start --web`.
- No automated test exists or is added for `DishFormScreen.tsx` or `DishesListScreen.tsx` themselves (screen components; no RN rendering test environment in this codebase — established pattern from prior modules). Verified via `tsc --noEmit`, the full Jest suite, and a live check on an EAS preview build.
- Work happens on its own worktree/branch (e.g. `worktree-dish-photo-persistence`), not `main`.

---

## File Structure

- **Modify** `src/db/schema.ts` — `dishes` gains a nullable `photo_uri` column; `migrateSchema` gains a second defensive `ALTER TABLE` step.
- **Modify** `__tests__/db/schema.test.ts` — add fresh-create and migration cases for `photo_uri`, mirroring the existing `is_estimated` cases.
- **Modify** `src/repositories/dishesRepo.ts` — `DishInput`, `Dish`, `DishSummary`, `DishRow` gain `photoUri`/`photo_uri`; `createDish`/`updateDish`/`getDish`/`listDishes` read/write it. Pure DB layer, no filesystem I/O.
- **Modify** `__tests__/repositories/dishesRepo.test.ts` — add `photoUri` round-trip cases (create, default-null, update, list summary).
- **Create** `src/services/dishPhotoStorage.ts` — `persistDishPhoto(sourceUri): Promise<string>`, `deleteDishPhoto(uri): Promise<void>`, using `expo-file-system`.
- **Create** `__tests__/services/dishPhotoStorage.test.ts` — mocks `expo-file-system`'s `File`/`Directory`/`Paths`.
- **Modify** `src/services/dishPhotoCapture.ts` — `captureAndRecognizeDishPhoto` returns `{ recognition: RecognitionResult; photoUri: string }` instead of just `RecognitionResult`.
- **Modify** `__tests__/services/dishPhotoCapture.test.ts` — update assertions for the new return shape.
- **Modify** `src/screens/PhotoRecognitionButton.tsx` — `onRecognized` prop type matches the new return shape (its body is unchanged — already just forwards the value).
- **Modify** `src/screens/DishFormScreen.tsx` — `existingPhotoUri`/`pendingPhotoUri` state, `handleRecognized` update, photo/placeholder UI at the top of the form, `handleSave`/`handleDelete` persistence and cleanup logic.
- **Modify** `src/screens/DishesListScreen.tsx` — thumbnail/placeholder on the left of each row.
- **Modify** `package.json` — adds the `expo-file-system` dependency.

---

### Task 1: Schema — `photo_uri` column and migration

**Files:**
- Modify: `src/db/schema.ts`
- Test: `__tests__/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the `dishes` table (fresh or migrated) has a nullable `photo_uri TEXT` column. Task 2 (`dishesRepo.ts`) reads/writes this column.

- [ ] **Step 1: Write the failing tests**

In `__tests__/db/schema.test.ts`, add these three cases at the end of the `describe('database schema', ...)` block:

```ts
  it('has the photo_uri column on dishes after a fresh create', async () => {
    const db = await createTestDatabase();
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(dishes)');
    expect(columns.map((c) => c.name)).toContain('photo_uri');
  });

  it('migrateSchema adds photo_uri to a pre-existing dishes table that lacks it', async () => {
    const db = await createTestDatabase();
    // Simulate a database created before photo_uri existed.
    await db.execAsync('DROP TABLE dishes');
    await db.execAsync(`
      CREATE TABLE dishes (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const before = await db.getAllAsync<{ name: string }>('PRAGMA table_info(dishes)');
    expect(before.map((c) => c.name)).not.toContain('photo_uri');

    await migrateSchema(db);

    const after = await db.getAllAsync<{ name: string }>('PRAGMA table_info(dishes)');
    expect(after.map((c) => c.name)).toContain('photo_uri');
  });

  it('migrateSchema is a no-op that does not throw when photo_uri already exists', async () => {
    const db = await createTestDatabase();
    await expect(migrateSchema(db)).resolves.not.toThrow();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/db/schema.test.ts`
Expected: FAIL — the first new test fails because `dishes` has no `photo_uri` column yet; the second fails because `migrateSchema` doesn't add it.

- [ ] **Step 3: Implement the schema and migration changes**

In `src/db/schema.ts`, replace the `dishes` table definition:

```ts
CREATE TABLE IF NOT EXISTS dishes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  photo_uri TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Replace the full `migrateSchema` function:

```ts
export async function migrateSchema(db: SqlExecutor): Promise<void> {
  const dishItemsColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(dish_items)');
  if (!dishItemsColumns.some((c) => c.name === 'is_estimated')) {
    await db.execAsync('ALTER TABLE dish_items ADD COLUMN is_estimated INTEGER NOT NULL DEFAULT 0');
  }

  const dishesColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(dishes)');
  if (!dishesColumns.some((c) => c.name === 'photo_uri')) {
    await db.execAsync('ALTER TABLE dishes ADD COLUMN photo_uri TEXT');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/db/schema.test.ts`
Expected: PASS, all tests in the file green (the pre-existing `is_estimated` cases plus the 3 new `photo_uri` cases).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts __tests__/db/schema.test.ts
git commit -m "feat: add photo_uri column to dishes with a defensive migration"
```

---

### Task 2: Repository — thread `photoUri` through `dishesRepo`

**Files:**
- Modify: `src/repositories/dishesRepo.ts`
- Test: `__tests__/repositories/dishesRepo.test.ts`

**Interfaces:**
- Consumes: the `photo_uri` column (Task 1).
- Produces: `DishInput.photoUri?: string | null` (optional — every existing call site that omits it keeps working, defaulting to `null`). `Dish.photoUri: string | null` and `DishSummary.photoUri: string | null` (always present on read). Task 5 (`DishFormScreen`) and Task 6 (`DishesListScreen`) both consume these.

- [ ] **Step 1: Write the failing tests**

In `__tests__/repositories/dishesRepo.test.ts`, add these four cases at the end of the `describe('dishesRepo', ...)` block:

```ts
  it('persists and round-trips a photoUri', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dish = await createDish(db, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: false }],
      photoUri: 'file:///document/dish-photos/abc.jpg',
    });

    expect(dish.photoUri).toBe('file:///document/dish-photos/abc.jpg');

    const reloaded = await getDish(db, dish.id);
    expect(reloaded?.photoUri).toBe('file:///document/dish-photos/abc.jpg');
  });

  it('defaults photoUri to null when not provided', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dish = await createDish(db, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: false }],
    });

    expect(dish.photoUri).toBeNull();
  });

  it('updates photoUri on an existing dish', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    const dish = await createDish(db, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: false }],
      photoUri: 'file:///document/dish-photos/old.jpg',
    });

    await updateDish(db, dish.id, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: false }],
      photoUri: 'file:///document/dish-photos/new.jpg',
    });

    const updated = await getDish(db, dish.id);
    expect(updated?.photoUri).toBe('file:///document/dish-photos/new.jpg');
  });

  it('includes photoUri in dish summaries from listDishes', async () => {
    const rice = await createProduct(db, { name: 'Rice', carbsPer100g: 28 });
    await createDish(db, {
      name: 'Rice bowl',
      items: [{ productId: rice.id, grams: 100, isEstimated: false }],
      photoUri: 'file:///document/dish-photos/abc.jpg',
    });

    const results = await listDishes(db, 'Rice bowl');
    expect(results[0].photoUri).toBe('file:///document/dish-photos/abc.jpg');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/repositories/dishesRepo.test.ts`
Expected: FAIL — TypeScript compile error (`photoUri` doesn't exist on `DishInput`) surfaces as a `ts-jest` failure, and `dish.photoUri`/`results[0].photoUri` are `undefined` even once that's fixed enough to run.

- [ ] **Step 3: Implement the repository changes**

In `src/repositories/dishesRepo.ts`, replace the `DishInput` interface:

```ts
export interface DishInput {
  name: string;
  items: DishItemInput[];
  photoUri?: string | null;
}
```

Replace the `Dish` interface:

```ts
export interface Dish {
  id: string;
  name: string;
  photoUri: string | null;
  items: DishItem[];
  totals: DishTotals;
  createdAt: string;
  updatedAt: string;
}
```

Replace the `DishSummary` interface:

```ts
export interface DishSummary {
  id: string;
  name: string;
  photoUri: string | null;
  totalWeight: number;
  totalCarbs: number;
  totalW: number;
  hasEstimatedItems: boolean;
}
```

Replace the `DishRow` interface:

```ts
interface DishRow {
  id: string;
  name: string;
  photo_uri: string | null;
  created_at: string;
  updated_at: string;
}
```

In `createDish`, replace the transaction body's `INSERT INTO dishes` call:

```ts
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO dishes (id, name, photo_uri, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      input.name,
      input.photoUri ?? null,
      now,
      now,
    ]);
    await replaceItemsRaw(db, id, input.items);
  });
```

In `updateDish`, replace the transaction body's `UPDATE dishes` call:

```ts
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE dishes SET name = ?, photo_uri = ?, updated_at = ? WHERE id = ?', [
      input.name,
      input.photoUri ?? null,
      now,
      id,
    ]);
    await replaceItemsRaw(db, id, input.items);
  });
```

In `getDish`, replace the return statement:

```ts
  return {
    id: row.id,
    name: row.name,
    photoUri: row.photo_uri,
    items,
    totals: dishTotals(items),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
```

Replace the full `listDishes` function:

```ts
export async function listDishes(db: SqlExecutor, searchTerm = ''): Promise<DishSummary[]> {
  const rows = await db.getAllAsync<{ id: string; name: string; photo_uri: string | null }>(
    `SELECT dishes.id AS id, dishes.name AS name, dishes.photo_uri AS photo_uri
     FROM dishes
     WHERE dishes.name LIKE ?
     ORDER BY dishes.name COLLATE NOCASE`,
    [`%${searchTerm}%`]
  );

  const summaries: DishSummary[] = [];
  for (const row of rows) {
    const items = await loadItems(db, row.id);
    const totals = dishTotals(items);
    summaries.push({
      id: row.id,
      name: row.name,
      photoUri: row.photo_uri,
      totalWeight: totals.totalWeight,
      totalCarbs: totals.totalCarbs,
      totalW: totals.totalW,
      hasEstimatedItems: totals.hasEstimatedItems,
    });
  }

  return summaries;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/repositories/dishesRepo.test.ts`
Expected: PASS, all tests in the file green (pre-existing cases plus the 4 new `photoUri` cases).

Run: `npx tsc --noEmit`
Expected: no errors (this will still show errors in `DishFormScreen.tsx` and `DishesListScreen.tsx` if they read `Dish`/`DishSummary` fields in a way that's now stale — check there are none; Tasks 5/6 are what actually add the new UI, so no error is expected yet from this task alone).

- [ ] **Step 5: Commit**

```bash
git add src/repositories/dishesRepo.ts __tests__/repositories/dishesRepo.test.ts
git commit -m "feat: thread photoUri through dishesRepo"
```

---

### Task 3: New service — `dishPhotoStorage.ts`

**Files:**
- Modify: `package.json` (add `expo-file-system`)
- Create: `src/services/dishPhotoStorage.ts`
- Test: `__tests__/services/dishPhotoStorage.test.ts`

**Interfaces:**
- Consumes: `generateId()` from `src/utils/id.ts` (existing).
- Produces: `persistDishPhoto(sourceUri: string): Promise<string>`, `deleteDishPhoto(uri: string | null | undefined): Promise<void>`. Task 5 (`DishFormScreen`) consumes both.

- [ ] **Step 1: Install `expo-file-system`**

Run (from the project root): `npx expo install expo-file-system`
Expected: `package.json` gains an `expo-file-system` dependency entry at the version Expo's own tooling resolves for this project's installed SDK (57), and `node_modules`/lockfile update to match.

- [ ] **Step 2: Write the failing tests**

Create `__tests__/services/dishPhotoStorage.test.ts`:

```ts
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  Directory: jest.fn(),
  Paths: { document: { __brand: 'document-dir' } },
}));

jest.mock('../../src/utils/id', () => ({
  generateId: jest.fn(),
}));

import { File, Directory, Paths } from 'expo-file-system';
import { generateId } from '../../src/utils/id';
import { persistDishPhoto, deleteDishPhoto } from '../../src/services/dishPhotoStorage';

describe('persistDishPhoto', () => {
  let copyMock: jest.Mock;
  let directoryCreateMock: jest.Mock;
  let directoryInstance: { exists: boolean; create: jest.Mock };
  let destFileInstance: { uri: string };

  beforeEach(() => {
    jest.clearAllMocks();
    (generateId as jest.Mock).mockReturnValue('generated-id');

    directoryCreateMock = jest.fn();
    directoryInstance = { exists: false, create: directoryCreateMock };
    (Directory as unknown as jest.Mock).mockImplementation(function () {
      return directoryInstance;
    });

    copyMock = jest.fn().mockResolvedValue(undefined);
    destFileInstance = { uri: 'file:///document/dish-photos/generated-id.jpg' };
    (File as unknown as jest.Mock).mockImplementation(function (...args: unknown[]) {
      // One arg => the source file (new File(sourceUri)); two args => the
      // destination file (new File(directory, name)).
      if (args.length === 1) {
        return { copy: copyMock };
      }
      return destFileInstance;
    });
  });

  it('creates the dish-photos directory when it does not exist yet', async () => {
    await persistDishPhoto('file:///cache/photo.jpg');

    expect(Directory).toHaveBeenCalledWith(Paths.document, 'dish-photos');
    expect(directoryCreateMock).toHaveBeenCalled();
  });

  it('skips directory creation when it already exists', async () => {
    directoryInstance.exists = true;

    await persistDishPhoto('file:///cache/photo.jpg');

    expect(directoryCreateMock).not.toHaveBeenCalled();
  });

  it('copies the source file to a generated filename inside the directory', async () => {
    await persistDishPhoto('file:///cache/photo.jpg');

    expect(File).toHaveBeenCalledWith('file:///cache/photo.jpg');
    expect(File).toHaveBeenCalledWith(directoryInstance, 'generated-id.jpg');
    expect(copyMock).toHaveBeenCalledWith(destFileInstance);
  });

  it('returns the persisted file uri', async () => {
    const uri = await persistDishPhoto('file:///cache/photo.jpg');

    expect(uri).toBe('file:///document/dish-photos/generated-id.jpg');
  });
});

describe('deleteDishPhoto', () => {
  it('deletes the file at the given uri', async () => {
    const deleteMock = jest.fn();
    (File as unknown as jest.Mock).mockImplementation(function () {
      return { delete: deleteMock };
    });

    await deleteDishPhoto('file:///document/dish-photos/old.jpg');

    expect(File).toHaveBeenCalledWith('file:///document/dish-photos/old.jpg');
    expect(deleteMock).toHaveBeenCalled();
  });

  it('swallows an error thrown by delete()', async () => {
    (File as unknown as jest.Mock).mockImplementation(function () {
      return {
        delete: () => {
          throw new Error('file not found');
        },
      };
    });

    await expect(deleteDishPhoto('file:///document/dish-photos/missing.jpg')).resolves.not.toThrow();
  });

  it('is a no-op for null', async () => {
    await deleteDishPhoto(null);
    expect(File).not.toHaveBeenCalled();
  });

  it('is a no-op for undefined', async () => {
    await deleteDishPhoto(undefined);
    expect(File).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest __tests__/services/dishPhotoStorage.test.ts`
Expected: FAIL — `Cannot find module '../../src/services/dishPhotoStorage'`.

- [ ] **Step 4: Implement `dishPhotoStorage.ts`**

Create `src/services/dishPhotoStorage.ts`:

```ts
import { File, Directory, Paths } from 'expo-file-system';
import { generateId } from '../utils/id';

const PHOTOS_DIR_NAME = 'dish-photos';

export async function persistDishPhoto(sourceUri: string): Promise<string> {
  const photosDir = new Directory(Paths.document, PHOTOS_DIR_NAME);
  if (!photosDir.exists) {
    photosDir.create();
  }

  const sourceFile = new File(sourceUri);
  const destFile = new File(photosDir, `${generateId()}.jpg`);
  await sourceFile.copy(destFile);
  return destFile.uri;
}

export async function deleteDishPhoto(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // Best-effort cleanup: a missing file or permission issue here must
    // never block saving or deleting a dish.
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/services/dishPhotoStorage.test.ts`
Expected: PASS, all 8 tests green.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/services/dishPhotoStorage.ts __tests__/services/dishPhotoStorage.test.ts
git commit -m "feat: add dishPhotoStorage service for persisting dish photos"
```

---

### Task 4: Capture pipeline — return the local photo URI

**Files:**
- Modify: `src/services/dishPhotoCapture.ts`
- Test: `__tests__/services/dishPhotoCapture.test.ts`
- Modify: `src/screens/PhotoRecognitionButton.tsx`

**Interfaces:**
- Consumes: `RecognitionResult` from `src/services/dishRecognition.ts` (unchanged).
- Produces: `captureAndRecognizeDishPhoto(source: 'camera' | 'gallery'): Promise<{ recognition: RecognitionResult; photoUri: string }>`. `PhotoRecognitionButton`'s `onRecognized: (result: { recognition: RecognitionResult; photoUri: string }) => void` prop. Task 5 (`DishFormScreen`) consumes both.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `__tests__/services/dishPhotoCapture.test.ts`:

```ts
import {
  captureAndRecognizeDishPhoto,
  PhotoPermissionDeniedError,
  PhotoPickCancelledError,
} from '../../src/services/dishPhotoCapture';

jest.mock('expo-image-picker', () => {
  const actualExports: any = {};
  actualExports.requestCameraPermissionsAsync = jest.fn();
  actualExports.requestMediaLibraryPermissionsAsync = jest.fn();
  actualExports.launchCameraAsync = jest.fn();
  actualExports.launchImageLibraryAsync = jest.fn();
  return actualExports;
});

jest.mock('expo-image-manipulator', () => {
  const manipulate = jest.fn();
  return {
    ImageManipulator: { manipulate },
    SaveFormat: { JPEG: 'jpeg' },
  };
});

jest.mock('../../src/db/database', () => ({
  openDatabase: jest.fn(),
}));

jest.mock('../../src/repositories/productsRepo', () => ({
  listProducts: jest.fn(),
}));

jest.mock('../../src/services/dishRecognition', () => {
  class DishRecognitionError extends Error {}
  return {
    recognizeDish: jest.fn(),
    DishRecognitionError,
  };
});

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { openDatabase } from '../../src/db/database';
import { listProducts } from '../../src/repositories/productsRepo';
import { recognizeDish, DishRecognitionError } from '../../src/services/dishRecognition';

describe('captureAndRecognizeDishPhoto', () => {
  let saveAsyncMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    saveAsyncMock = jest.fn().mockResolvedValue({ uri: 'file:///cache/resized.jpg', base64: 'abc123' });
    const renderAsync = jest.fn().mockResolvedValue({ saveAsync: saveAsyncMock });
    const resize = jest.fn().mockReturnValue({ renderAsync });
    (ImageManipulator.manipulate as jest.Mock).mockReturnValue({ resize });

    (openDatabase as jest.Mock).mockResolvedValue({});
    (listProducts as jest.Mock).mockResolvedValue([{ name: 'Rice' }, { name: 'Beans' }]);
    (recognizeDish as jest.Mock).mockResolvedValue({
      items: [{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 100 }],
      dishNameSuggestions: [],
    });
  });

  it('requests camera permission and picks via the camera for source "camera"', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 800, height: 600 }],
    });

    const result = await captureAndRecognizeDishPhoto('camera');

    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(result).toEqual({
      recognition: {
        items: [{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 100 }],
        dishNameSuggestions: [],
      },
      photoUri: 'file:///cache/resized.jpg',
    });
  });

  it('requests media library permission and picks via the gallery for source "gallery"', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 600, height: 800 }],
    });

    await captureAndRecognizeDishPhoto('gallery');

    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('resizes by width when the image is wider than tall', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 1600, height: 900 }],
    });

    await captureAndRecognizeDishPhoto('camera');

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file://photo.jpg');
    const resizeMock = (ImageManipulator.manipulate as jest.Mock).mock.results[0].value.resize;
    expect(resizeMock).toHaveBeenCalledWith({ width: 1024 });
  });

  it('resizes by height when the image is taller than wide', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 900, height: 1600 }],
    });

    await captureAndRecognizeDishPhoto('camera');

    const resizeMock = (ImageManipulator.manipulate as jest.Mock).mock.results[0].value.resize;
    expect(resizeMock).toHaveBeenCalledWith({ height: 1024 });
  });

  it('throws PhotoPermissionDeniedError when permission is denied', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(PhotoPermissionDeniedError);
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('throws PhotoPickCancelledError when the picker is cancelled', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: [] });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(PhotoPickCancelledError);
  });

  it('throws PhotoPickCancelledError when no assets are returned', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [] });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(PhotoPickCancelledError);
  });

  it('throws DishRecognitionError when the manipulator produces no base64 data', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 800, height: 600 }],
    });
    const saveAsync = jest.fn().mockResolvedValue({ uri: 'file:///cache/resized.jpg', base64: undefined });
    const renderAsync = jest.fn().mockResolvedValue({ saveAsync });
    const resize = jest.fn().mockReturnValue({ renderAsync });
    (ImageManipulator.manipulate as jest.Mock).mockReturnValue({ resize });

    await expect(captureAndRecognizeDishPhoto('camera')).rejects.toThrow(DishRecognitionError);
  });

  it('passes the resized base64 image and product names to recognizeDish', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 800, height: 600 }],
    });

    await captureAndRecognizeDishPhoto('camera');

    expect(recognizeDish).toHaveBeenCalledWith('abc123', ['Rice', 'Beans']);
    expect(saveAsyncMock).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  });

  it('returns the resized image local uri alongside the recognition result', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://photo.jpg', width: 800, height: 600 }],
    });

    const result = await captureAndRecognizeDishPhoto('camera');

    expect(result.photoUri).toBe('file:///cache/resized.jpg');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/dishPhotoCapture.test.ts`
Expected: FAIL — `captureAndRecognizeDishPhoto` still resolves to a bare `RecognitionResult`, so `result.recognition`/`result.photoUri` don't match.

- [ ] **Step 3: Implement the capture pipeline change**

In `src/services/dishPhotoCapture.ts`, replace the full function:

```ts
export async function captureAndRecognizeDishPhoto(
  source: 'camera' | 'gallery'
): Promise<{ recognition: RecognitionResult; photoUri: string }> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PhotoPermissionDeniedError('Camera/photo access is needed for this feature.');
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || result.assets.length === 0) {
    throw new PhotoPickCancelledError('No photo was selected.');
  }
  const asset = result.assets[0];

  // Cap the longest edge at ~1024px, scaling the other dimension proportionally,
  // regardless of orientation.
  //
  // This must be a ternary that yields exactly one key (`{ width }` OR `{ height }`),
  // not an object literal passing both with one set to `null`: expo-image-manipulator's
  // web implementation checks `!== undefined` to decide whether a dimension was
  // requested, so an explicit `null` is treated as a real (zero) value instead of
  // "auto" and crashes canvas rendering.
  const resizeOptions = asset.width >= asset.height ? { width: 1024 } : { height: 1024 };
  const rendered = await ImageManipulator.manipulate(asset.uri).resize(resizeOptions).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) {
    throw new DishRecognitionError('Could not process the photo.');
  }

  const db = await openDatabase();
  const productNames = (await listProducts(db, '')).map((p) => p.name);
  const recognition = await recognizeDish(saved.base64, productNames);
  return { recognition, photoUri: saved.uri };
}
```

(Only the signature/return line and the final two lines changed — everything else in the function is unchanged.)

- [ ] **Step 4: Update `PhotoRecognitionButton`'s prop type**

In `src/screens/PhotoRecognitionButton.tsx`, replace the `Props` interface:

```ts
interface Props {
  onRecognized: (result: { recognition: RecognitionResult; photoUri: string }) => void;
}
```

(No other change to this file — `pickFrom` already just forwards whatever `captureAndRecognizeDishPhoto` resolves to.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/services/dishPhotoCapture.test.ts`
Expected: PASS, all tests green.

Run: `npx tsc --noEmit`
Expected: no errors from these two files (an error is still expected from `DishFormScreen.tsx`, whose `handleRecognized`/`runAutoCapture` haven't been updated yet — that's Task 5, not a regression here).

- [ ] **Step 6: Commit**

```bash
git add src/services/dishPhotoCapture.ts __tests__/services/dishPhotoCapture.test.ts src/screens/PhotoRecognitionButton.tsx
git commit -m "feat: return the local photo uri from captureAndRecognizeDishPhoto"
```

---

### Task 5: `DishFormScreen` — display, persist, and clean up the photo

**Files:**
- Modify: `src/screens/DishFormScreen.tsx`

**Interfaces:**
- Consumes: `Dish.photoUri` (Task 2), `persistDishPhoto`/`deleteDishPhoto` (Task 3), `captureAndRecognizeDishPhoto`'s new return shape and `PhotoRecognitionButton`'s new `onRecognized` prop (Task 4).
- Produces: no new exports — this is a screen.

No dedicated automated test (no RN test environment for screens in this codebase). Verified via `tsc --noEmit` and the full Jest suite as a regression check, then a live check per the Global Constraints.

- [ ] **Step 1: Update imports**

Replace the full import block at the top of the file:

```ts
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { openDatabase } from '../db/database';
import { listProducts, Product } from '../repositories/productsRepo';
import { createDish, updateDish, deleteDish, getDish } from '../repositories/dishesRepo';
import { dishTotals } from '../calculations/carbs';
import PhotoRecognitionButton from './PhotoRecognitionButton';
import type { RecognitionResult } from '../services/dishRecognition';
import type { DishesStackParamList } from '../navigation/RootNavigator';
import { buildIngredientRow, applyGramsEdit, IngredientRow } from './dishFormHelpers';
import { captureAndRecognizeDishPhoto, PhotoPickCancelledError } from '../services/dishPhotoCapture';
import { persistDishPhoto, deleteDishPhoto } from '../services/dishPhotoStorage';
import { ESTIMATED_ITEMS_WARNING, ESTIMATE_WARNING_COLOR } from '../constants/estimateWarning';
```

- [ ] **Step 2: Add photo state**

Immediately after `const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);`, add:

```ts
  const [existingPhotoUri, setExistingPhotoUri] = useState<string | null>(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
```

- [ ] **Step 3: Update `handleRecognized`**

Replace the `handleRecognized` function:

```ts
  const handleRecognized = ({ recognition, photoUri }: { recognition: RecognitionResult; photoUri: string }) => {
    setNameSuggestions(recognition.dishNameSuggestions);
    setPendingPhotoUri(photoUri);
    navigation.navigate('PhotoReview', {
      items: recognition.items,
      onConfirm: (confirmResult) => {
        confirmResult.matchedProducts.forEach(({ product, estimatedGrams }) =>
          addIngredient(product, estimatedGrams)
        );
        setPendingUnmatchedNames(confirmResult.unmatchedNames);
      },
    });
  };
```

(`runAutoCapture` needs no change — it already does `const result = await captureAndRecognizeDishPhoto(source); handleRecognized(result);`, forwarding whatever shape `captureAndRecognizeDishPhoto` resolves to.)

- [ ] **Step 4: Load `existingPhotoUri` when editing a dish**

In the `useEffect` that loads an existing dish by `dishId`, add a line setting `existingPhotoUri`:

```ts
  useEffect(() => {
    if (!dishId) return;
    (async () => {
      const db = await openDatabase();
      const dish = await getDish(db, dishId);
      if (dish) {
        setName(dish.name);
        setExistingPhotoUri(dish.photoUri);
        setItems(
          dish.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            carbsPer100g: item.carbsPer100g,
            gramsText: String(item.grams),
            isEstimated: item.isEstimated,
          }))
        );
      }
    })();
  }, [dishId]);
```

- [ ] **Step 5: Persist the photo (and clean up a replaced one) in `handleSave`**

Replace the full `handleSave` function:

```ts
  const handleSave = async () => {
    if (name.trim() === '') {
      setError('Name is required');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one ingredient');
      return;
    }
    for (const item of parsedItems) {
      if (Number.isNaN(item.grams) || item.grams <= 0) {
        setError(`Enter a valid weight for ${item.productName}`);
        return;
      }
    }
    setError(null);

    let photoUri = existingPhotoUri;
    if (pendingPhotoUri) {
      try {
        photoUri = await persistDishPhoto(pendingPhotoUri);
      } catch {
        // Best-effort: a failed photo copy must never block saving the dish's
        // name/ingredients. Fall back to whatever photo the dish already had.
        photoUri = existingPhotoUri;
      }
    }

    try {
      const db = await openDatabase();
      const input = {
        name: name.trim(),
        items: parsedItems.map((item) => ({
          productId: item.productId,
          grams: item.grams,
          isEstimated: item.isEstimated,
        })),
        photoUri,
      };
      if (dishId) {
        await updateDish(db, dishId, input);
      } else {
        await createDish(db, input);
      }
      if (photoUri !== existingPhotoUri) {
        await deleteDishPhoto(existingPhotoUri);
      }
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save dish');
    }
  };
```

(The `photoUri !== existingPhotoUri` check both skips the delete when there was no new photo this session, and skips it when a new capture's persistence failed and fell back to the existing photo — in neither case is there an old file to clean up.)

- [ ] **Step 6: Clean up the photo in `handleDelete`**

Replace the full `handleDelete` function:

```ts
  const handleDelete = () => {
    if (!dishId) return;
    Alert.alert('Delete dish', 'Are you sure you want to delete this dish? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const db = await openDatabase();
          await deleteDish(db, dishId);
          await deleteDishPhoto(existingPhotoUri);
          navigation.goBack();
        },
      },
    ]);
  };
```

- [ ] **Step 7: Render the photo or a placeholder at the top of the form**

Replace the opening of the `ScrollView`:

```tsx
      <ScrollView contentContainerStyle={styles.container}>
        {autoCaptureLoading && <ActivityIndicator style={styles.autoCaptureLoading} />}
        {autoCaptureError && <Text style={styles.error}>{autoCaptureError}</Text>}

        <Text style={styles.label}>Name</Text>
```

with:

```tsx
      <ScrollView contentContainerStyle={styles.container}>
        {pendingPhotoUri ?? existingPhotoUri ? (
          <Image source={{ uri: (pendingPhotoUri ?? existingPhotoUri) as string }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Ionicons name="image-outline" size={32} color="#999" />
          </View>
        )}

        {autoCaptureLoading && <ActivityIndicator style={styles.autoCaptureLoading} />}
        {autoCaptureError && <Text style={styles.error}>{autoCaptureError}</Text>}

        <Text style={styles.label}>Name</Text>
```

- [ ] **Step 8: Add the new styles**

In the `StyleSheet.create` call, add two entries right after `container: { padding: 16 },`:

```ts
  photo: { width: '100%', height: 200, borderRadius: 8, marginBottom: 4 },
  photoPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
```

- [ ] **Step 9: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx jest`
Expected: all suites still passing (regression check).

- [ ] **Step 10: Commit**

```bash
git add src/screens/DishFormScreen.tsx
git commit -m "feat: display, persist, and clean up a dish's photo on DishFormScreen"
```

---

### Task 6: `DishesListScreen` — thumbnail on each row

**Files:**
- Modify: `src/screens/DishesListScreen.tsx`

**Interfaces:**
- Consumes: `DishSummary.photoUri` (Task 2).
- Produces: no new exports — this is a screen.

No dedicated automated test (no RN test environment for screens in this codebase). Verified via `tsc --noEmit` and the full Jest suite as a regression check, then a live check per the Global Constraints.

- [ ] **Step 1: Update imports**

Replace the top of the file:

```tsx
import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { openDatabase } from '../db/database';
import { listDishes, DishSummary } from '../repositories/dishesRepo';
import type { DishesStackParamList } from '../navigation/RootNavigator';
import { ESTIMATED_ITEMS_WARNING, ESTIMATE_WARNING_COLOR } from '../constants/estimateWarning';
```

- [ ] **Step 2: Add the thumbnail/placeholder to each row**

Replace the `renderItem` function passed to `FlatList`:

```tsx
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('DishForm', { dishId: item.id })}>
            {item.photoUri ? (
              <Image source={{ uri: item.photoUri }} style={styles.thumbnail} />
            ) : (
              <View style={styles.thumbnailPlaceholder}>
                <Ionicons name="image-outline" size={20} color="#999" />
              </View>
            )}
            <View style={styles.textStack}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.detail}>
                {item.totalWeight} g · {item.totalCarbs.toFixed(1)} g carbs · {item.totalW.toFixed(1)} W
              </Text>
              {item.hasEstimatedItems && <Text style={styles.estimatedFlag}>{ESTIMATED_ITEMS_WARNING}</Text>}
            </View>
          </TouchableOpacity>
        )}
```

- [ ] **Step 3: Update the styles**

Replace the `row` style entry and add three new ones right after it:

```ts
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  thumbnail: { width: 48, height: 48, borderRadius: 8, marginRight: 12 },
  thumbnailPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textStack: { flex: 1 },
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx jest`
Expected: all suites still passing (regression check).

- [ ] **Step 5: Commit**

```bash
git add src/screens/DishesListScreen.tsx
git commit -m "feat: show a photo thumbnail on each row in DishesListScreen"
```

---

## Post-plan verification (not a task — do after Task 6)

Run `npx tsc --noEmit` and `npx jest` at the app root, both green. Then, since `expo-file-system`'s new API has no web support (per the Global Constraints), do a live check on a real device via an EAS preview build (`eas build --profile preview`), not `expo start --web`:

1. Photograph a dish via the recognition flow, confirm the ingredients, and save it. Confirm a thumbnail appears for it in `DishesListScreen` and the same photo appears at the top of `DishFormScreen` when reopening it.
2. Reopen that dish, capture a new photo, and save again. Confirm the list thumbnail and form photo both update to the new photo (not the old one).
3. Delete that dish. Confirm it disappears from the list as before (no automated way to confirm the underlying file was removed from a live device, but this exercises `deleteDishPhoto` on a real filesystem without throwing/crashing the screen).
4. Add a dish manually via "+ Add dish" (no photo). Confirm it shows the plain placeholder icon in both the list and the form, never a broken image.
