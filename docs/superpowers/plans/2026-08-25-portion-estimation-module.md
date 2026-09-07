# Portion/Volume Estimation from Photo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Have Claude's existing dish-photo recognition call also estimate each recognized ingredient's weight in grams, and pre-fill that estimate — visibly flagged as such — into the dish ingredient's grams field instead of leaving it blank.

**Architecture:** Extends Module 2's existing single-call pipeline (`DishFormScreen` → `PhotoRecognitionButton` → Worker `POST /recognize` → Claude vision tool call → `PhotoReviewScreen` → `DishFormScreen`). One new field, `estimatedGrams: number | null`, is added to the tool schema/prompt on the Worker side and threaded through the existing types and screens on the app side, with a small new pure-function module carrying the prefill/flag/clear-on-edit logic so it stays unit-testable (the screens themselves have no unit-test coverage in this codebase — only pure logic does).

**Tech Stack:** Expo/React Native/TypeScript (app), Cloudflare Worker + `@anthropic-ai/sdk` + `claude-haiku-4-5` (worker), Jest (app tests), Vitest (worker tests).

## Global Constraints

- Model stays `claude-haiku-4-5` — no model change, still one call per photo (from spec: "No change to model choice ... or the one-call-per-photo cost/latency shape").
- No new network calls, endpoints, or error states — this module only extends the existing `/recognize` request/response payload (spec: "No new error states are introduced").
- `estimatedGrams` is `integer | null` in the wire contract; invalid/missing/non-positive values are treated as `null` ("fail soft"), same pattern as an unmatched `matchedProductName`.
- The estimate is prefilled but always user-editable; editing it clears the "estimated" flag permanently for that row (spec: "editing clears the flag ... treated as a normal manually-entered value").
- Per `AGENTS.md`: Expo has changed — consult the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo-API code. (No new Expo APIs are introduced by this module, so this is not expected to come up, but it applies if it does.)
- Per project convention, all work happens on the current branch (`module-3-portion-estimation`) and is not committed to `main` directly.

---

## File Structure

- **Modify** `worker/src/recognize.ts` — add `estimatedGrams` to `RecognizedItem`, the tool's `input_schema`, the prompt text, and `parseAnthropicToolResult`'s validation.
- **Modify** `worker/src/recognize.test.ts` — cover the schema/prompt addition and the new parsing/validation branches.
- **Modify** `src/services/dishRecognition.ts` — add `estimatedGrams` to the app-side `RecognizedItem` interface (pure type change; the fetch/parse logic already passes the object through untouched).
- **Modify** `__tests__/services/dishRecognition.test.ts` — one test confirming `estimatedGrams` survives the round trip.
- **Create** `src/screens/dishFormHelpers.ts` — pure helpers used by `DishFormScreen`: building an `IngredientRow` from a product (+ optional estimate) and applying a manual grams edit (which clears the estimate flag). Existing screens have no direct unit tests in this codebase (no React Testing Library / RN test environment is configured — `package.json`'s Jest config is `testEnvironment: "node"`), so this module keeps the estimate-handling logic in a plain, testable file rather than inline in the component.
- **Create** `__tests__/screens/dishFormHelpers.test.ts` — unit tests for both helpers.
- **Modify** `src/navigation/RootNavigator.tsx` — widen `PhotoReviewParams.onConfirm`'s result type to carry `estimatedGrams` alongside each matched product / unmatched name.
- **Modify** `src/screens/PhotoReviewScreen.tsx` — carry `estimatedGrams` from each `RecognizedItem` into `ReviewRow`, and shape `handleConfirm`'s output to match the widened type.
- **Modify** `src/screens/DishFormScreen.tsx` — use the new helpers for `addIngredient`/`setGrams`, thread the estimate through `pendingUnmatchedNames`, and render the "(estimated)" flag on prefilled rows.

---

### Task 1: Worker — estimate ingredient grams in the recognition tool call

**Files:**
- Modify: `worker/src/recognize.ts`
- Test: `worker/src/recognize.test.ts`

**Interfaces:**
- Consumes: nothing new — extends the existing `buildToolDefinition`, `buildAnthropicRequestParams`, `parseAnthropicToolResult` in this file.
- Produces: `RecognizedItem` (exported from this file) gains `estimatedGrams: number | null`. `parseAnthropicToolResult(input: unknown, productNames: string[]): RecognizedItem[]` now populates that field on every returned item.

- [ ] **Step 1: Write the failing tests**

Add to `worker/src/recognize.test.ts`, inside the existing `describe('buildAnthropicRequestParams', ...)` block:

```ts
  it('includes estimatedGrams as a required, nullable field in the tool schema', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: [] });
    const itemSchema = params.tools[0].input_schema.properties.items.items;
    expect(itemSchema.properties.estimatedGrams).toBeDefined();
    expect(itemSchema.properties.estimatedGrams.type).toEqual(['integer', 'null']);
    expect(itemSchema.required).toContain('estimatedGrams');
  });

  it('asks the model to estimate portion weight in the prompt text', () => {
    const params = buildAnthropicRequestParams({ image: 'abc', productNames: [] });
    const content = params.messages[0].content;
    const textBlock = content.find((b) => b.type === 'text');
    expect(textBlock?.text).toContain('grams');
  });
```

Add a new `describe` block at the end of the file, after the existing `describe('parseAnthropicToolResult', ...)` block:

```ts
describe('parseAnthropicToolResult — estimatedGrams', () => {
  it('passes through a valid positive integer estimate', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 150 }] },
      []
    );
    expect(items).toEqual([{ name: 'Rice', matchedProductName: null, estimatedGrams: 150 }]);
  });

  it('rounds a non-integer estimate defensively', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 150.6 }] },
      []
    );
    expect(items[0].estimatedGrams).toBe(151);
  });

  it('nulls out an explicit null estimate', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: null }] },
      []
    );
    expect(items[0].estimatedGrams).toBeNull();
  });

  it('nulls out a missing estimatedGrams field', () => {
    const items = parseAnthropicToolResult({ items: [{ name: 'Rice', matchedProductName: null }] }, []);
    expect(items[0].estimatedGrams).toBeNull();
  });

  it('nulls out a zero or negative estimate', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 0 }] },
      []
    );
    expect(items[0].estimatedGrams).toBeNull();
    const items2 = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: -5 }] },
      []
    );
    expect(items2[0].estimatedGrams).toBeNull();
  });

  it('nulls out a non-numeric estimate', () => {
    const items = parseAnthropicToolResult(
      { items: [{ name: 'Rice', matchedProductName: null, estimatedGrams: 'a lot' }] },
      []
    );
    expect(items[0].estimatedGrams).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd worker && npx vitest run`
Expected: the new tests FAIL — `estimatedGrams` is `undefined` in the schema, and `parseAnthropicToolResult`'s output objects don't have an `estimatedGrams` key at all (so `toEqual`/`toBeNull` assertions fail).

- [ ] **Step 3: Implement the schema, prompt, and parsing changes**

In `worker/src/recognize.ts`, update the top-level interface:

```ts
export interface RecognizedItem {
  name: string;
  matchedProductName: string | null;
  estimatedGrams: number | null;
}
```

In `buildToolDefinition`, add the field to the item schema and mark it required (replace the whole function body):

```ts
function buildToolDefinition() {
  return {
    name: RECOGNIZE_TOOL_NAME,
    description:
      'Report every distinct ingredient visible in the dish photo, matched against the provided list of existing product names where possible.',
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
      },
      required: ['items'],
      additionalProperties: false,
    },
  };
}
```

In `buildAnthropicRequestParams`, extend the instruction text (replace the `text` field of the text content block):

```ts
          {
            type: 'text' as const,
            text: `Identify every distinct ingredient visible in this dish photo. ${productListText}\n\nFor each ingredient, report its name and, if it matches one of the listed products in meaning (not necessarily exact wording), report that product's exact name as matchedProductName. Otherwise set matchedProductName to null.\n\nAlso estimate that ingredient's visible portion weight in grams, using ordinary visual cues such as plate or bowl size, how full a container looks, and typical serving sizes for that kind of food. No physical reference object is provided in the photo, so use your best judgment. If you genuinely cannot judge it, set estimatedGrams to null.`,
          },
```

In `parseAnthropicToolResult`, update the destructuring and returned object (replace the `.map` callback body):

```ts
  return items.map((item) => {
    if (typeof item !== 'object' || item === null || typeof (item as Record<string, unknown>).name !== 'string') {
      throw new RecognizeRequestError('Unexpected item shape from recognition model', 502);
    }
    const { name, matchedProductName, estimatedGrams } = item as Record<string, unknown>;
    const resolvedMatch =
      typeof matchedProductName === 'string'
        ? (productNames.find((p) => p.toLowerCase() === matchedProductName.toLowerCase()) ?? null)
        : null;
    const resolvedEstimatedGrams =
      typeof estimatedGrams === 'number' && Number.isFinite(estimatedGrams) && estimatedGrams > 0
        ? Math.round(estimatedGrams)
        : null;
    return {
      name: name as string,
      matchedProductName: resolvedMatch,
      estimatedGrams: resolvedEstimatedGrams,
    };
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd worker && npx vitest run`
Expected: PASS — all tests in `recognize.test.ts`, including the new ones, green.

- [ ] **Step 5: Type-check the worker**

Run: `cd worker && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add worker/src/recognize.ts worker/src/recognize.test.ts
git commit -m "feat: estimate ingredient portion weight in the recognition tool call"
```

---

### Task 2: App service — thread estimatedGrams through the recognition client

**Files:**
- Modify: `src/services/dishRecognition.ts`
- Test: `__tests__/services/dishRecognition.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RecognizedItem` (exported from this file, used by `PhotoRecognitionButton`, `DishFormScreen`, `PhotoReviewScreen`) gains `estimatedGrams: number | null`.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/services/dishRecognition.test.ts`, inside the `describe('recognizeDish', ...)` block:

```ts
  it('passes through estimatedGrams from the response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 150 }],
      }),
    }) as unknown as typeof fetch;

    const items = await recognizeDish('base64data', ['Rice']);

    expect(items).toEqual([{ name: 'Rice', matchedProductName: 'Rice', estimatedGrams: 150 }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/services/dishRecognition.test.ts`
Expected: FAIL with a type error at compile time via `ts-jest` (`estimatedGrams` doesn't exist on the expected type), since `RecognizedItem` doesn't have the field yet.

- [ ] **Step 3: Implement the type change**

In `src/services/dishRecognition.ts`, update the interface:

```ts
export interface RecognizedItem {
  name: string;
  matchedProductName: string | null;
  estimatedGrams: number | null;
}
```

No other code in this file changes — `recognizeDish` already returns `data.items` as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/services/dishRecognition.test.ts`
Expected: PASS, all tests in the file green (including the pre-existing ones, unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/services/dishRecognition.ts __tests__/services/dishRecognition.test.ts
git commit -m "feat: thread estimatedGrams through the recognition client type"
```

---

### Task 3: Ingredient-row helpers — prefill estimate, clear flag on edit

**Files:**
- Create: `src/screens/dishFormHelpers.ts`
- Test: `__tests__/screens/dishFormHelpers.test.ts`

**Interfaces:**
- Consumes: `Product` from `../repositories/productsRepo` (`{ id: string; name: string; carbsPer100g: number; ... }`).
- Produces:
  - `interface IngredientRow { productId: string; productName: string; carbsPer100g: number; gramsText: string; isEstimated: boolean }`
  - `buildIngredientRow(product: Product, estimatedGrams?: number | null): IngredientRow`
  - `applyGramsEdit(item: IngredientRow, gramsText: string): IngredientRow`

  Task 4 imports `IngredientRow`, `buildIngredientRow`, and `applyGramsEdit` from this file.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/screens/dishFormHelpers.test.ts`:

```ts
import { buildIngredientRow, applyGramsEdit, IngredientRow } from '../../src/screens/dishFormHelpers';
import type { Product } from '../../src/repositories/productsRepo';

const product: Product = {
  id: 'p1',
  name: 'Rice',
  carbsPer100g: 28,
  isSeed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('buildIngredientRow', () => {
  it('prefills gramsText and flags the row when an estimate is given', () => {
    const row = buildIngredientRow(product, 150);
    expect(row).toEqual({
      productId: 'p1',
      productName: 'Rice',
      carbsPer100g: 28,
      gramsText: '150',
      isEstimated: true,
    });
  });

  it('leaves gramsText blank and unflagged when the estimate is null', () => {
    const row = buildIngredientRow(product, null);
    expect(row.gramsText).toBe('');
    expect(row.isEstimated).toBe(false);
  });

  it('defaults to no estimate when none is passed', () => {
    const row = buildIngredientRow(product);
    expect(row.gramsText).toBe('');
    expect(row.isEstimated).toBe(false);
  });
});

describe('applyGramsEdit', () => {
  it('updates gramsText and clears the estimated flag', () => {
    const estimated: IngredientRow = {
      productId: 'p1',
      productName: 'Rice',
      carbsPer100g: 28,
      gramsText: '150',
      isEstimated: true,
    };
    const edited = applyGramsEdit(estimated, '200');
    expect(edited).toEqual({ ...estimated, gramsText: '200', isEstimated: false });
  });

  it('keeps a non-estimated row unflagged after editing', () => {
    const manual: IngredientRow = {
      productId: 'p1',
      productName: 'Rice',
      carbsPer100g: 28,
      gramsText: '',
      isEstimated: false,
    };
    const edited = applyGramsEdit(manual, '75');
    expect(edited).toEqual({ ...manual, gramsText: '75', isEstimated: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/screens/dishFormHelpers.test.ts`
Expected: FAIL — `src/screens/dishFormHelpers.ts` doesn't exist yet (module not found).

- [ ] **Step 3: Implement the helpers**

Create `src/screens/dishFormHelpers.ts`:

```ts
import type { Product } from '../repositories/productsRepo';

export interface IngredientRow {
  productId: string;
  productName: string;
  carbsPer100g: number;
  gramsText: string;
  isEstimated: boolean;
}

export function buildIngredientRow(product: Product, estimatedGrams: number | null = null): IngredientRow {
  return {
    productId: product.id,
    productName: product.name,
    carbsPer100g: product.carbsPer100g,
    gramsText: estimatedGrams !== null ? String(estimatedGrams) : '',
    isEstimated: estimatedGrams !== null,
  };
}

export function applyGramsEdit(item: IngredientRow, gramsText: string): IngredientRow {
  return { ...item, gramsText, isEstimated: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/screens/dishFormHelpers.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/screens/dishFormHelpers.ts __tests__/screens/dishFormHelpers.test.ts
git commit -m "feat: add ingredient-row helpers for estimate prefill and edit-clearing"
```

---

### Task 4: Wire estimates through the review screen and dish form

**Files:**
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/screens/PhotoReviewScreen.tsx`
- Modify: `src/screens/DishFormScreen.tsx`

**Interfaces:**
- Consumes: `RecognizedItem` (Task 2, now has `estimatedGrams`), `IngredientRow` / `buildIngredientRow` / `applyGramsEdit` (Task 3).
- Produces: no new exports consumed elsewhere — this is the top of the chain (screens).

This task has no dedicated automated test (these screens have no unit-test coverage in this codebase — see File Structure notes). Correctness is covered by: the Task 1–3 unit tests for the logic it calls into, a full type-check, and the existing test suite staying green as a regression check.

- [ ] **Step 1: Widen the navigation param types**

In `src/navigation/RootNavigator.tsx`, replace the `PhotoReviewParams` type:

```ts
export type PhotoReviewParams = {
  items: RecognizedItem[];
  onConfirm: (result: {
    matchedProducts: { product: Product; estimatedGrams: number | null }[];
    unmatchedNames: { name: string; estimatedGrams: number | null }[];
  }) => void;
};
```

- [ ] **Step 2: Update PhotoReviewScreen to carry the estimate through**

In `src/screens/PhotoReviewScreen.tsx`, update the `ReviewRow` interface:

```ts
interface ReviewRow {
  name: string;
  product: Product | null;
  estimatedGrams: number | null;
  checked: boolean;
}
```

Update the row-building effect (inside the existing `useEffect`, the `items.map` callback):

```ts
      const resolved = await Promise.all(
        items.map(async (item) => {
          const product = item.matchedProductName ? await getProductByName(db, item.matchedProductName) : null;
          return { name: item.name, product, estimatedGrams: item.estimatedGrams, checked: true };
        })
      );
```

Update `handleConfirm`:

```ts
  const handleConfirm = () => {
    if (!rows) return;
    const matchedProducts = rows
      .filter((r) => r.checked && r.product)
      .map((r) => ({ product: r.product as Product, estimatedGrams: r.estimatedGrams }));
    const unmatchedNames = rows
      .filter((r) => r.checked && !r.product)
      .map((r) => ({ name: r.name, estimatedGrams: r.estimatedGrams }));
    onConfirm({ matchedProducts, unmatchedNames });
    navigation.goBack();
  };
```

- [ ] **Step 3: Update DishFormScreen to prefill and flag estimates**

In `src/screens/DishFormScreen.tsx`:

Replace the import block's local type and add the helper imports (remove the existing inline `interface IngredientRow { ... }` block entirely, and add this import alongside the existing ones):

```ts
import { buildIngredientRow, applyGramsEdit, IngredientRow } from './dishFormHelpers';
```

Change the `pendingUnmatchedNames` state declaration:

```ts
  const [pendingUnmatchedNames, setPendingUnmatchedNames] = useState<
    { name: string; estimatedGrams: number | null }[]
  >([]);
```

Update `handleRecognized`:

```ts
  const handleRecognized = (recognizedItems: RecognizedItem[]) => {
    navigation.navigate('PhotoReview', {
      items: recognizedItems,
      onConfirm: (result) => {
        result.matchedProducts.forEach(({ product, estimatedGrams }) => addIngredient(product, estimatedGrams));
        setPendingUnmatchedNames(result.unmatchedNames);
      },
    });
  };
```

Update the `pendingUnmatchedNames` effect:

```ts
  useEffect(() => {
    if (pendingUnmatchedNames.length === 0) return;
    const next = pendingUnmatchedNames[0];
    navigation.navigate('ProductForm', {
      prefillName: next.name,
      onCreated: (product) => {
        addIngredient(product, next.estimatedGrams);
        setPendingUnmatchedNames((prev) => prev.slice(1));
      },
    });
  }, [pendingUnmatchedNames]);
```

Update `addIngredient` to accept and use the estimate:

```ts
  const addIngredient = (product: Product, estimatedGrams: number | null = null) => {
    setItems((prev) => {
      if (prev.some((item) => item.productId === product.id)) {
        setError('Already added');
        return prev;
      }
      return [...prev, buildIngredientRow(product, estimatedGrams)];
    });
    setProductSearch('');
    setMatches([]);
  };
```

Update `setGrams` to use the helper (clearing the estimate flag on edit):

```ts
  const setGrams = (index: number, gramsText: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? applyGramsEdit(item, gramsText) : item)));
  };
```

Update the ingredient row rendering to show the estimate flag (replace the existing `items.map` block in the JSX):

```tsx
        {items.map((item, index) => (
          <View key={`${item.productId}-${index}`} style={styles.ingredientRow}>
            <Text style={styles.ingredientName}>{item.productName}</Text>
            <TextInput
              style={[styles.gramsInput, item.isEstimated && styles.gramsInputEstimated]}
              value={item.gramsText}
              onChangeText={(text) => setGrams(index, text)}
              placeholder="g"
              keyboardType="numeric"
            />
            {item.isEstimated && <Text style={styles.estimatedLabel}>(estimated)</Text>}
            <TouchableOpacity onPress={() => removeIngredient(index)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
```

Add two new style entries to the `StyleSheet.create` call at the bottom of the file, alongside the existing `gramsInput`/`removeText` entries:

```ts
  gramsInputEstimated: { fontStyle: 'italic', color: '#777' },
  estimatedLabel: { fontSize: 11, color: '#777', marginRight: 8 },
```

- [ ] **Step 4: Type-check the app**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full app test suite as a regression check**

Run: `npx jest`
Expected: PASS, all suites green (no test targets this task's screens directly, but this confirms nothing else broke).

- [ ] **Step 6: Commit**

```bash
git add src/navigation/RootNavigator.tsx src/screens/PhotoReviewScreen.tsx src/screens/DishFormScreen.tsx
git commit -m "feat: prefill and flag estimated grams in the dish ingredient form"
```

---

## Post-plan verification (not a task — do after Task 4)

Consistent with how Module 2 was verified: run `npx tsc --noEmit` and `npx jest` at the repo root, and `cd worker && npx tsc --noEmit && npx vitest run` in the worker directory, all green. Live estimation quality can't be exercised in this dev environment (no deployed Worker/API key — same open gap Module 2 left behind); wiring can optionally be spot-checked via `expo start --web` + chrome-devtools MCP using a fixture response, the same approach used for Module 1 and 2.
