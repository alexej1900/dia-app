# Dish Name Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a photo recognition, Claude also suggests 2-3 whole-dish names in the same `/recognize` call; they render as tappable chips above `DishFormScreen`'s Name field, prefilling it on tap, only while the field is still empty.

**Architecture:** One field, `dishNameSuggestions: string[]`, added as a sibling to the existing `items` array everywhere it flows: the Worker's tool schema/prompt/parser, the Worker's HTTP response, the app's `recognizeDish`/`captureAndRecognizeDishPhoto` return types, and finally `DishFormScreen`'s UI. No new endpoint, no new network call, no schema/database change, no change to the ingredient-matching flow.

**Tech Stack:** Cloudflare Workers/TypeScript (worker), Expo/React Native/TypeScript (app), Vitest (worker tests), Jest (app tests).

**Spec:** `docs/superpowers/specs/2026-09-11-dish-name-suggestions-design.md`

## Global Constraints

- `dishNameSuggestions` is a **required** field in the tool schema (always present in a valid response), but its value may be an empty array — matching how `items` is already required and how `estimatedGrams`/`matchedProductName` are required-but-nullable per item.
- Suggestions must fail soft: a missing or non-array `dishNameSuggestions` on either the Anthropic tool-call input or the Worker's HTTP response body resolves to `[]`, never a thrown error. Non-string array entries are filtered out, not rejected outright.
- Chips render on `DishFormScreen` only, directly above the Name field, only when `name.trim() === '' && nameSuggestions.length > 0`. No new screen, no persistence of suggestions.
- `PhotoReviewScreen` and the ingredient-matching/unmatched-routing flow are untouched — they only ever consume `items`, which keeps the exact same shape.
- No automated test exists or is added for `DishFormScreen.tsx` itself (screen component, no RN rendering test environment in this codebase — established pattern from Modules 4-5). Verified via `tsc --noEmit`, the full Jest/Vitest suites, and a live spot-check (this environment now has a real deployed Worker with working Anthropic credits, unlike prior modules — a live check is realistically possible and should be done before considering this feature verified).
- Work happens on the current branch (`worktree-dish-name-suggestions`), not `main`.

---

## File Structure

- **Modify** `worker/src/recognize.ts` — tool schema gains `dishNameSuggestions`; prompt text gains an instruction for it; `parseAnthropicToolResult`'s return type changes from `RecognizedItem[]` to a new exported `RecognitionResult` shape.
- **Modify** `worker/src/recognize.test.ts` — migrate ~15 existing `parseAnthropicToolResult` assertions from the bare-array shape to the wrapped shape; add new schema/parsing test cases.
- **Modify** `worker/src/index.ts` — the successful-recognition response passes through the new wrapped shape instead of re-wrapping just `items`.
- **Modify** `src/services/dishRecognition.ts` — add `RecognitionResult` type; `recognizeDish`'s return type and parsing change to match.
- **Modify** `__tests__/services/dishRecognition.test.ts` — migrate 2 existing assertions to the wrapped shape; add a missing-field fail-soft case.
- **Modify** `src/services/dishPhotoCapture.ts` — `captureAndRecognizeDishPhoto`'s return type changes to `RecognitionResult` (no logic change).
- **Modify** `__tests__/services/dishPhotoCapture.test.ts` — migrate the one assertion on the mocked return value to the wrapped shape.
- **Modify** `src/screens/PhotoRecognitionButton.tsx` — `onRecognized` prop type changes to take a `RecognitionResult`.
- **Modify** `src/screens/DishFormScreen.tsx` — `nameSuggestions` state, `handleRecognized` update, chip row UI + styles.

---

### Task 1: Worker — `dishNameSuggestions` in the schema, prompt, and parser

**Files:**
- Modify: `worker/src/recognize.ts`
- Test: `worker/src/recognize.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RecognitionResult` (new exported interface: `{ items: RecognizedItem[]; dishNameSuggestions: string[] }`). `parseAnthropicToolResult(input: unknown, productNames: string[]): RecognitionResult` — signature unchanged except return type. Task 2 (`index.ts`) consumes this new return shape directly.

- [ ] **Step 1: Write the failing tests**

In `worker/src/recognize.test.ts`, the `describe('parseAnthropicToolResult', ...)` and `describe('parseAnthropicToolResult — estimatedGrams', ...)` blocks contain 15 tests total. 13 of them currently assert the return value as a bare array (e.g. `expect(items).toEqual([{...}])`) and need updating to assert against `.items` on the wrapped result instead — mechanically: rename the destructured/assigned variable from `items` to `result` at each call site, and change every `expect(items).toEqual(X)` / `expect(items[0]...)` to `expect(result.items).toEqual(X)` / `expect(result.items[0]...)`. The other 2 (`'treats a missing items array as malformed'`, `'treats an item missing a name as malformed'`) only assert that a call throws — they don't assign or destructure a return value at all, so leave those two exactly as they are. Do not change any of the 13 tests' *inputs* (the first argument passed to `parseAnthropicToolResult`) — none of them need a `dishNameSuggestions` key added, since a missing one must already fail soft to `[]` per this task's own implementation.

For example, the first test in `describe('parseAnthropicToolResult', ...)` changes from:

```ts
  it('parses matched and unmatched items', () => {
    const items = parseAnthropicToolResult(
      {
        items: [
          { name: 'Chicken breast', matchedProductName: 'Chicken breast' },
          { name: 'Sauteed spinach', matchedProductName: null },
        ],
      },
      ['Chicken breast']
    );
    expect(items).toEqual([
      { name: 'Chicken breast', matchedProductName: 'Chicken breast', estimatedGrams: null },
      { name: 'Sauteed spinach', matchedProductName: null, estimatedGrams: null },
    ]);
  });
```

to:

```ts
  it('parses matched and unmatched items', () => {
    const result = parseAnthropicToolResult(
      {
        items: [
          { name: 'Chicken breast', matchedProductName: 'Chicken breast' },
          { name: 'Sauteed spinach', matchedProductName: null },
        ],
      },
      ['Chicken breast']
    );
    expect(result.items).toEqual([
      { name: 'Chicken breast', matchedProductName: 'Chicken breast', estimatedGrams: null },
      { name: 'Sauteed spinach', matchedProductName: null, estimatedGrams: null },
    ]);
  });
```

Apply the identical `items` → `result`, `expect(items...)` → `expect(result.items...)` mechanical transform to every other test in both of those two `describe` blocks that assigns/destructures a return value (12 more of them, for 13 total). The two tests that assert a thrown error (`'treats a missing items array as malformed'`, `'treats an item missing a name as malformed'`) don't assign or destructure a return value at all — leave those two exactly as they are.

Then add a new `describe('parseAnthropicToolResult — dishNameSuggestions', ...)` block with these cases:

```ts
describe('parseAnthropicToolResult — dishNameSuggestions', () => {
  it('passes through valid suggestions', () => {
    const result = parseAnthropicToolResult(
      { items: [], dishNameSuggestions: ['Grilled Chicken with Jollof Rice', 'Chicken and Rice Plate'] },
      []
    );
    expect(result.dishNameSuggestions).toEqual(['Grilled Chicken with Jollof Rice', 'Chicken and Rice Plate']);
  });

  it('defaults to an empty array when the field is missing', () => {
    const result = parseAnthropicToolResult({ items: [] }, []);
    expect(result.dishNameSuggestions).toEqual([]);
  });

  it('defaults to an empty array when the field is not an array', () => {
    const result = parseAnthropicToolResult({ items: [], dishNameSuggestions: 'not an array' }, []);
    expect(result.dishNameSuggestions).toEqual([]);
  });

  it('filters out non-string entries rather than failing', () => {
    const result = parseAnthropicToolResult(
      { items: [], dishNameSuggestions: ['Valid Name', 42, null, 'Another Valid Name'] },
      []
    );
    expect(result.dishNameSuggestions).toEqual(['Valid Name', 'Another Valid Name']);
  });

  it('accepts an explicit empty array', () => {
    const result = parseAnthropicToolResult({ items: [], dishNameSuggestions: [] }, []);
    expect(result.dishNameSuggestions).toEqual([]);
  });
});
```

Also add one new test to the `describe('buildAnthropicRequestParams', ...)` block, mirroring the existing `'includes estimatedGrams as a required, nullable field in the tool schema'` test:

```ts
  it('includes dishNameSuggestions as a required array field in the tool schema', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: [] });
    const schema = params.tools[0].input_schema;
    expect(schema.properties.dishNameSuggestions).toBeDefined();
    expect(schema.properties.dishNameSuggestions.type).toBe('array');
    expect(schema.required).toContain('dishNameSuggestions');
  });

  it('asks the model to suggest a dish name in the prompt text', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: [] });
    const content = params.messages[0].content;
    const textBlock = content.find((b) => b.type === 'text');
    expect(textBlock?.text.toLowerCase()).toContain('name');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `worker/`): `npx vitest run`
Expected: FAIL — `dishNameSuggestions` doesn't exist on the schema or the parser's output yet; `result.items` accesses `undefined` on the old bare-array return value (a runtime `TypeError` in the migrated tests, not just an assertion mismatch, since `parseAnthropicToolResult` doesn't return an object yet).

- [ ] **Step 3: Implement the schema, prompt, and parser changes**

In `worker/src/recognize.ts`, replace the `RecognizedItem` interface block with this (adding `RecognitionResult` alongside it):

```ts
export interface RecognizedItem {
  name: string;
  matchedProductName: string | null;
  estimatedGrams: number | null;
}

export interface RecognitionResult {
  items: RecognizedItem[];
  dishNameSuggestions: string[];
}
```

In `buildToolDefinition()`, replace the full `input_schema` object:

```ts
    input_schema: {
      type: 'object' as const,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The ingredient name as you identify it from the photo.',
              },
              matchedProductName: {
                type: ['string', 'null'],
                description:
                  "The exact matching name from the supplied product list, if this ingredient corresponds to one of them in meaning. Null if it does not match any of them.",
              },
              estimatedGrams: {
                type: ['integer', 'null'],
                description:
                  "Your best-guess weight of this ingredient's visible portion in grams, based on typical portion sizes, plate/bowl scale, and food density. Null if you cannot judge it from the photo.",
              },
            },
            required: ['name', 'matchedProductName', 'estimatedGrams'],
            additionalProperties: false,
          },
        },
        dishNameSuggestions: {
          type: 'array',
          items: { type: 'string' },
          description:
            '2-3 short, natural suggested names for the dish as a whole (not per-ingredient) that a home cook might use, e.g. "Grilled Chicken with Jollof Rice" or "Chicken and Rice Plate". Empty array if the dish is too generic or ambiguous to name with confidence.',
        },
      },
      required: ['items', 'dishNameSuggestions'],
      additionalProperties: false,
    },
```

In `buildAnthropicRequestParams`, replace the prompt's text block content (the string inside the `{ type: 'text' as const, text: ... }` block) — append a new paragraph to the end of the existing text, so the full string becomes:

```ts
            text: `Identify every distinct ingredient visible in this dish photo. ${productListText}\n\nFor each ingredient, report its name and, if it matches one of the listed products in meaning (not necessarily exact wording), report that product's exact name as matchedProductName. Otherwise set matchedProductName to null.\n\nAlso estimate that ingredient's visible portion weight in grams, using ordinary visual cues such as plate or bowl size, how full a container looks, and typical serving sizes for that kind of food. No physical reference object is provided in the photo, so use your best judgment. If you genuinely cannot judge it, set estimatedGrams to null.\n\nFinally, suggest 2-3 short, natural names for the dish as a whole (not per-ingredient) that a home cook might use, such as "Grilled Chicken with Jollof Rice" or "Chicken and Rice Plate". If the dish is too generic or ambiguous to name with confidence, return an empty array for dishNameSuggestions.`,
```

Replace the full `parseAnthropicToolResult` function:

```ts
export function parseAnthropicToolResult(input: unknown, productNames: string[]): RecognitionResult {
  if (typeof input !== 'object' || input === null || !('items' in input)) {
    throw new RecognizeRequestError('Unexpected response shape from recognition model', 502);
  }
  const { items, dishNameSuggestions } = input as { items: unknown; dishNameSuggestions?: unknown };
  if (!Array.isArray(items)) {
    throw new RecognizeRequestError('Unexpected response shape from recognition model', 502);
  }
  const parsedItems = items.map((item) => {
    if (typeof item !== 'object' || item === null || typeof (item as Record<string, unknown>).name !== 'string') {
      throw new RecognizeRequestError('Unexpected item shape from recognition model', 502);
    }
    const { name, matchedProductName, estimatedGrams } = item as Record<string, unknown>;
    const resolvedMatch =
      typeof matchedProductName === 'string'
        ? (productNames.find((p) => p.toLowerCase() === matchedProductName.toLowerCase()) ?? null)
        : null;
    const roundedEstimatedGrams =
      typeof estimatedGrams === 'number' && Number.isFinite(estimatedGrams) ? Math.round(estimatedGrams) : null;
    const resolvedEstimatedGrams =
      roundedEstimatedGrams !== null && roundedEstimatedGrams > 0 && roundedEstimatedGrams <= MAX_PLAUSIBLE_ESTIMATED_GRAMS
        ? roundedEstimatedGrams
        : null;
    return {
      name: name as string,
      matchedProductName: resolvedMatch,
      estimatedGrams: resolvedEstimatedGrams,
    };
  });

  const resolvedDishNameSuggestions = Array.isArray(dishNameSuggestions)
    ? dishNameSuggestions.filter((s): s is string => typeof s === 'string')
    : [];

  return { items: parsedItems, dishNameSuggestions: resolvedDishNameSuggestions };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `worker/`): `npx vitest run`
Expected: PASS, all tests in the file green (the pre-existing count plus 5 new `dishNameSuggestions` parsing tests plus 2 new `buildAnthropicRequestParams` tests).

- [ ] **Step 5: Commit**

```bash
git add worker/src/recognize.ts worker/src/recognize.test.ts
git commit -m "feat: add dishNameSuggestions to the recognition tool schema and parser"
```

---

### Task 2: Worker — pass `dishNameSuggestions` through the HTTP response

**Files:**
- Modify: `worker/src/index.ts`

**Interfaces:**
- Consumes: `RecognitionResult` (Task 1) from `parseAnthropicToolResult`.
- Produces: the `/recognize` endpoint's success response body changes from `{ items }` to `{ items, dishNameSuggestions }`. Task 3 (app-side `recognizeDish`) reads both fields from this response.

No dedicated test file exists for `worker/src/index.ts` in this codebase (it's the thin HTTP-glue layer; `recognize.test.ts` only covers the pure functions it calls) — verified via `npx tsc --noEmit` only.

- [ ] **Step 1: Update the response-building code**

In `worker/src/index.ts`, replace:

```ts
    try {
      const items = parseAnthropicToolResult(toolUse.input, body.productNames);
      return jsonResponse({ items }, 200);
    } catch (e) {
```

with:

```ts
    try {
      const result = parseAnthropicToolResult(toolUse.input, body.productNames);
      return jsonResponse(result, 200);
    } catch (e) {
```

(`result` already has the shape `{ items, dishNameSuggestions }` from Task 1, so it's passed straight through rather than re-wrapped.)

- [ ] **Step 2: Verify**

Run (from `worker/`): `npx tsc --noEmit`
Expected: no errors.

Run (from `worker/`): `npx vitest run`
Expected: PASS, same count as Task 1 left it (this change touches no code any existing test covers).

- [ ] **Step 3: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat: pass dishNameSuggestions through the /recognize response"
```

---

### Task 3: App services — thread `RecognitionResult` through the capture pipeline

**Files:**
- Modify: `src/services/dishRecognition.ts`
- Test: `__tests__/services/dishRecognition.test.ts`
- Modify: `src/services/dishPhotoCapture.ts`
- Test: `__tests__/services/dishPhotoCapture.test.ts`
- Modify: `src/screens/PhotoRecognitionButton.tsx`

**Interfaces:**
- Consumes: the Worker's `{ items, dishNameSuggestions }` response shape (Task 2).
- Produces: `RecognitionResult` (exported from `src/services/dishRecognition.ts`: `{ items: RecognizedItem[]; dishNameSuggestions: string[] }`). `recognizeDish(imageBase64: string, productNames: string[]): Promise<RecognitionResult>`. `captureAndRecognizeDishPhoto(source: 'camera' | 'gallery'): Promise<RecognitionResult>`. `PhotoRecognitionButton`'s `onRecognized: (result: RecognitionResult) => void` prop. Task 4 (`DishFormScreen.tsx`) consumes all three of these.

- [ ] **Step 1: Write the failing tests**

In `__tests__/services/dishRecognition.test.ts`, the test `'sends the image and product names, returning parsed items'` currently ends with:

```ts
    const items = await recognizeDish('base64data', ['Rice']);

    expect(items).toEqual([{ name: 'Rice', matchedProductName: 'Rice' }]);
```

Change to:

```ts
    const result = await recognizeDish('base64data', ['Rice']);

    expect(result.items).toEqual([{ name: 'Rice', matchedProductName: 'Rice' }]);
```

The test `'passes through estimatedGrams from the response'` currently ends with:

```ts
    const items = await recognizeDish('base64data', ['Rice']);

    expect(items).toEqual([{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 150 }]);
```

Change to:

```ts
    const result = await recognizeDish('base64data', ['Rice']);

    expect(result.items).toEqual([{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 150 }]);
```

Leave every other existing test in this file exactly as-is (they only check that an error is thrown, or that `fetch` was called with the right arguments — none of them inspect the resolved value's shape).

Add two new tests at the end of the `describe('recognizeDish', ...)` block:

```ts
  it('passes through dishNameSuggestions from the response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [],
        dishNameSuggestions: ['Grilled Chicken with Jollof Rice', 'Chicken and Rice Plate'],
      }),
    }) as unknown as typeof fetch;

    const result = await recognizeDish('base64data', []);

    expect(result.dishNameSuggestions).toEqual(['Grilled Chicken with Jollof Rice', 'Chicken and Rice Plate']);
  });

  it('defaults dishNameSuggestions to an empty array when the response omits it', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch;

    const result = await recognizeDish('base64data', []);

    expect(result.dishNameSuggestions).toEqual([]);
  });
```

In `__tests__/services/dishPhotoCapture.test.ts`, the shared `beforeEach` at the top of `describe('captureAndRecognizeDishPhoto', ...)` sets up `(recognizeDish as jest.Mock).mockResolvedValue([{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 100 }]);`. Update it to:

```ts
    (recognizeDish as jest.Mock).mockResolvedValue({
      items: [{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 100 }],
      dishNameSuggestions: [],
    });
```

The only test in this file that asserts the resolved value's shape is `'requests camera permission and picks via the camera for source "camera"'` (**not** `'passes the resized base64 image and product names to recognizeDish'`, despite the similar setup — that other test only checks `recognizeDish`'s call *arguments*, not its return value). It currently ends with:

```ts
    const items = await captureAndRecognizeDishPhoto('camera');

    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(items).toEqual([{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 100 }]);
```

Change the last two lines to:

```ts
    const result = await captureAndRecognizeDishPhoto('camera');

    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(result).toEqual({
      items: [{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 100 }],
      dishNameSuggestions: [],
    });
```

Every other test in this file calls `captureAndRecognizeDishPhoto` only to assert it rejects, or to inspect what arguments were passed to the mocked collaborators (`manipulate`, `resize`, `recognizeDish`'s call arguments) — none of them inspect the resolved value's shape, so the `beforeEach`'s updated mock is enough to keep them passing; no other test body needs editing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/dishRecognition.test.ts __tests__/services/dishPhotoCapture.test.ts`
Expected: FAIL — `result.items`/`result.dishNameSuggestions` access `undefined` (or the whole-object `toEqual` mismatches) since `recognizeDish`/`captureAndRecognizeDishPhoto` don't return the wrapped shape yet.

- [ ] **Step 3: Implement the service and prop-type changes**

Replace the full contents of `src/services/dishRecognition.ts`:

```ts
export interface RecognizedItem {
  name: string;
  matchedProductName: string | null;
  estimatedGrams: number | null;
}

export interface RecognitionResult {
  items: RecognizedItem[];
  dishNameSuggestions: string[];
}

export class DishRecognitionError extends Error {}

export async function recognizeDish(imageBase64: string, productNames: string[]): Promise<RecognitionResult> {
  const apiUrl = process.env.EXPO_PUBLIC_RECOGNITION_API_URL;
  const apiSecret = process.env.EXPO_PUBLIC_RECOGNITION_API_SECRET;
  if (!apiUrl || !apiSecret) {
    throw new DishRecognitionError('Recognition service is not configured.');
  }

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': apiSecret },
      body: JSON.stringify({ image: imageBase64, productNames }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'name' in e && e.name === 'TimeoutError') {
      throw new DishRecognitionError('Recognition timed out. Try again or add ingredients manually.');
    }
    throw new DishRecognitionError('Could not reach recognition service. Check your connection.');
  }

  if (!response.ok) {
    throw new DishRecognitionError('Recognition failed. Try again or add ingredients manually.');
  }

  const data = (await response.json()) as { items?: RecognizedItem[]; dishNameSuggestions?: string[] };
  return { items: data.items ?? [], dishNameSuggestions: data.dishNameSuggestions ?? [] };
}
```

In `src/services/dishPhotoCapture.ts`, replace the import line and the function's return type:

```ts
import { recognizeDish, RecognitionResult, DishRecognitionError } from './dishRecognition';
```

```ts
export async function captureAndRecognizeDishPhoto(source: 'camera' | 'gallery'): Promise<RecognitionResult> {
```

(No other change to this file — the function already just returns whatever `recognizeDish` resolves to.)

In `src/screens/PhotoRecognitionButton.tsx`, replace the import and the `Props` interface:

```ts
import { RecognitionResult } from '../services/dishRecognition';
import { captureAndRecognizeDishPhoto, PhotoPickCancelledError } from '../services/dishPhotoCapture';

interface Props {
  onRecognized: (result: RecognitionResult) => void;
}
```

And update the two call sites inside `pickFrom` that reference the old `items` variable name:

```ts
    try {
      const result = await captureAndRecognizeDishPhoto(source);
      onRecognized(result);
    } catch (e) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/services/dishRecognition.test.ts __tests__/services/dishPhotoCapture.test.ts`
Expected: PASS, all tests in both files green.

Run: `npx tsc --noEmit`
Expected: no errors (this will still show an error in `DishFormScreen.tsx`, since Task 4 hasn't updated it yet to match `PhotoRecognitionButton`'s new `onRecognized` prop type — that's expected and resolved by Task 4, not a regression from this task).

- [ ] **Step 5: Commit**

```bash
git add src/services/dishRecognition.ts src/services/dishPhotoCapture.ts src/screens/PhotoRecognitionButton.tsx __tests__/services/dishRecognition.test.ts __tests__/services/dishPhotoCapture.test.ts
git commit -m "feat: thread RecognitionResult through the dish photo capture pipeline"
```

---

### Task 4: `DishFormScreen` — suggestion chips

**Files:**
- Modify: `src/screens/DishFormScreen.tsx`

**Interfaces:**
- Consumes: `RecognitionResult` (Task 3), `PhotoRecognitionButton`'s updated `onRecognized` prop (Task 3).
- Produces: no new exports — this is the top of the chain (screen).

No dedicated automated test (no RN test environment configured for screens in this codebase). Verified via `tsc --noEmit` and the full Jest suite as a regression check.

- [ ] **Step 1: Update the `handleRecognized` and `runAutoCapture` signatures, and add `nameSuggestions` state**

Replace the import of `RecognizedItem`:

```ts
import type { RecognitionResult } from '../services/dishRecognition';
```

Immediately after the existing `const [error, setError] = useState<string | null>(null);` line, add:

```ts
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
```

Replace the `handleRecognized` function:

```ts
  const handleRecognized = (result: RecognitionResult) => {
    setNameSuggestions(result.dishNameSuggestions);
    navigation.navigate('PhotoReview', {
      items: result.items,
      onConfirm: (confirmResult) => {
        confirmResult.matchedProducts.forEach(({ product, estimatedGrams }) =>
          addIngredient(product, estimatedGrams)
        );
        setPendingUnmatchedNames(confirmResult.unmatchedNames);
      },
    });
  };
```

(Renamed the `onConfirm` callback's own parameter from `result` to `confirmResult` only to avoid shadowing the outer `result` parameter — the `PhotoReview` route's `onConfirm` param shape is unchanged from today.)

In `runAutoCapture`, replace the line that reads `const recognizedItems = await captureAndRecognizeDishPhoto(source); handleRecognized(recognizedItems);` with:

```ts
      const result = await captureAndRecognizeDishPhoto(source);
      handleRecognized(result);
```

- [ ] **Step 2: Add the chip row above the Name field**

Replace:

```tsx
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Rice bowl" />
```

with:

```tsx
        <Text style={styles.label}>Name</Text>
        {name.trim() === '' && nameSuggestions.length > 0 && (
          <View style={styles.suggestionRow}>
            {nameSuggestions.map((suggestion) => (
              <TouchableOpacity key={suggestion} style={styles.suggestionChip} onPress={() => setName(suggestion)}>
                <Text style={styles.suggestionChipText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Rice bowl" />
```

- [ ] **Step 3: Add the new styles**

In the `StyleSheet.create` call, add three entries alongside the existing `label`/`input` entries:

```ts
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  suggestionChip: { borderWidth: 1, borderColor: '#2e7d32', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  suggestionChipText: { color: '#2e7d32', fontSize: 14, fontWeight: '600' },
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx jest`
Expected: all suites still passing (regression check).

- [ ] **Step 5: Commit**

```bash
git add src/screens/DishFormScreen.tsx
git commit -m "feat: show tappable dish-name suggestion chips after photo recognition"
```

---

## Post-plan verification (not a task — do after Task 4)

Run `npx tsc --noEmit` and `npx jest` at the app root, and `npx vitest run` inside `worker/`, all green. Then, since this dev environment now has a real deployed Worker with working Anthropic credits (unlike every prior module), do a live spot-check before considering this feature verified: run the app (`expo start --web` for the gallery-pick path, or a fresh `eas build --profile preview` install on a real device for the full camera path), photograph or pick a real dish photo, and confirm suggestion chips appear above the Name field and that tapping one fills it in.
