# Dish Name Suggestions — Design Spec

Builds on the dish-photo-recognition pipeline (`docs/superpowers/specs/2026-08-08-dish-photo-recognition-design.md`, extended by Module 3's portion estimation and Module 4's total-carb-calculation specs — all merged).

## Purpose

Today, after photographing a dish, the app identifies ingredients and estimates portions, but the **Name** field on `DishFormScreen` stays blank — the user always has to type a name themselves, even though the photo (plus the ingredients Claude already identified) usually makes a reasonable dish name obvious. This feature has Claude suggest 2-3 whole-dish names in the same recognition call, shown as tappable chips that prefill the Name field.

## Architecture

No new endpoint, no new network round-trip. The existing `/recognize` Worker call already sends one photo and gets back one Claude response identifying ingredients (Module 2) and estimating their portions (Module 3, folded into the same call). This feature adds a third, sibling piece to that same response: `dishNameSuggestions: string[]`, naming the dish as a whole rather than any single ingredient.

```
Photo → captureAndRecognizeDishPhoto() → Worker /recognize → Claude (one call)
  → { items: RecognizedItem[], dishNameSuggestions: string[] }
  → DishFormScreen: items go through the existing PhotoReview → addIngredient flow (unchanged);
    dishNameSuggestions render as chips above the Name field, only while it's still empty.
```

## Worker changes (`worker/src/recognize.ts`)

- `buildToolDefinition()`'s `input_schema.properties` gains a sibling to `items`:
  ```ts
  dishNameSuggestions: {
    type: 'array',
    items: { type: 'string' },
    description:
      '2-3 short, natural suggested names for the dish as a whole (not per-ingredient) that a home cook might use, e.g. "Grilled Chicken with Jollof Rice" or "Chicken and Rice Plate". Empty array if the dish is too generic or ambiguous to name with confidence.',
  },
  ```
  Added to `required: ['items', 'dishNameSuggestions']` alongside the existing `items` — always present in the response, possibly an empty array, matching how `items` is already required and how `estimatedGrams`/`matchedProductName` are required-but-nullable per item (consistent existing pattern: required field, permissive value).
- The prompt text (in `buildAnthropicRequestParams`) gains one more instruction, appended after the existing portion-estimate paragraph: ask for 2-3 short, natural whole-dish names, and explicitly permit an empty array when the dish is too generic/ambiguous to name confidently (mirrors the existing "if you genuinely cannot judge it" permission already given for `estimatedGrams`).
- `parseAnthropicToolResult`'s return type changes from `RecognizedItem[]` to a new `RecognitionResult` shape (defined in this file, re-exported): `{ items: RecognizedItem[]; dishNameSuggestions: string[] }`. Validation: `dishNameSuggestions` must be an array; non-string entries are filtered out (fail soft, matching the existing pattern of tolerating minor model-shape drift rather than hard-failing the whole request over one bad field) rather than rejecting the whole response.

## Worker response shape (`worker/src/index.ts`)

The final `jsonResponse(...)` call for a successful recognition currently returns `{ items }`; it becomes `{ items, dishNameSuggestions }`, passing through what `parseAnthropicToolResult` returns unchanged.

## App-side types and services

- `src/services/dishRecognition.ts`: add `export interface RecognitionResult { items: RecognizedItem[]; dishNameSuggestions: string[]; }`. `recognizeDish`'s return type changes from `Promise<RecognizedItem[]>` to `Promise<RecognitionResult>`; it now reads both `data.items ?? []` and `data.dishNameSuggestions ?? []` from the response body (both fail soft to an empty array if the Worker's response is ever missing either field, matching the function's existing defensive `?? []` on `items`).
- `src/services/dishPhotoCapture.ts`: `captureAndRecognizeDishPhoto`'s return type changes from `Promise<RecognizedItem[]>` to `Promise<RecognitionResult>` — it already just returns whatever `recognizeDish` resolves to, so the change is only in the type, not the logic.

## UI wiring (`DishFormScreen.tsx`, `PhotoRecognitionButton.tsx`)

- `PhotoRecognitionButton`'s `onRecognized` prop changes from `(items: RecognizedItem[]) => void` to `(result: RecognitionResult) => void` — it already just forwards whatever `captureAndRecognizeDishPhoto` resolves to.
- `DishFormScreen` gains `const [nameSuggestions, setNameSuggestions] = useState<string[]>([])`.
- `handleRecognized` (called from both the manual `PhotoRecognitionButton` path and the auto-trigger `runAutoCapture` path — both already funnel into this one function) now receives a `RecognitionResult`, calls `setNameSuggestions(result.dishNameSuggestions)`, and passes `result.items` to `PhotoReview` exactly as `items` is passed today (the `PhotoReview` screen and its `onConfirm` matching/unmatched flow are completely unaffected — they only ever cared about `items`).
- Chip row renders directly above the Name `TextInput`, only when `name.trim() === '' && nameSuggestions.length > 0`. Tapping a chip calls `setName(suggestion)`; no special hide-on-tap logic is needed — the same empty-name condition that shows the chips naturally hides them again once `name` is non-empty. If the user later clears the name back to empty, the chips reappear (using the same condition) — this is acceptable, not a bug: it means "still available if you want them," not "must be dismissed."
- Chips are simple `TouchableOpacity`-wrapped `Text`, styled consistently with the app's existing pill/chip-less-but-bordered button convention (a thin border, rounded corners — matching e.g. `PhotoRecognitionButton`'s `button` style) laid out in a wrapping row (`flexWrap: 'wrap'`, since 2-3 short suggestions plus small screens means they may not fit one line).

## Error handling

No new error states. If `dishNameSuggestions` comes back empty (Claude's own judgment call) or the recognition call fails entirely (existing `DishRecognitionError` paths, unchanged), the chip row simply doesn't render — falls back to today's fully-manual name entry with no new failure mode to handle.

## Testing & verification

- **Worker unit tests** (`worker/src/recognize.test.ts`, Vitest): extend the existing `buildAnthropicRequestParams` test to assert the tool schema's `dishNameSuggestions` property and its presence in `required`. **Every existing `parseAnthropicToolResult` test (~15 of them, across the `parseAnthropicToolResult` and `parseAnthropicToolResult — estimatedGrams` describe blocks) currently asserts the return value as a bare `RecognizedItem[]` array** (e.g. `expect(items).toEqual([{...}])`) — changing the return shape to `{ items, dishNameSuggestions }` breaks every one of them, not just the tests that care about the new field. All of them need their assertions updated to the wrapped shape (e.g. `expect(result.items).toEqual([{...}])`, or `expect(result).toEqual({ items: [...], dishNameSuggestions: [] })`), even though most of those tests' *inputs* (the `tool_use.input` fixtures they pass in) don't need to change, since a missing `dishNameSuggestions` key on the input side already fails soft to `[]` per the parsing rule above. Add new cases for: suggestions present and passed through, non-array `dishNameSuggestions` failing soft to `[]`, non-string entries filtered out.
- **App unit tests** (Jest): same migration shape as the Worker tests above. `__tests__/services/dishRecognition.test.ts` has 2 tests asserting `recognizeDish`'s resolved value directly as a bare array (`expect(items).toEqual([{...}])`, in the "returning parsed items" and "passes through estimatedGrams" tests) — both need updating to the wrapped `{ items, dishNameSuggestions }` shape, and their `json: async () => ({ items: [...] })` mock fixtures need a `dishNameSuggestions` key added (or left absent, to also exercise the fail-soft-to-`[]` path — pick whichever this task's fixtures don't already cover). `__tests__/services/dishPhotoCapture.test.ts` mocks `recognizeDish`'s resolved value as a bare array (`recognizeDish.mockResolvedValue([{...}])`) and asserts `captureAndRecognizeDishPhoto`'s result the same way (`expect(items).toEqual([{...}])`, in the "passes the resized base64..." test) — same migration. Add one new case (in either file) for a response missing `dishNameSuggestions` failing soft to `[]`.
- **No test for the chip UI itself** — `DishFormScreen.tsx` is a screen component with zero existing test coverage in this codebase (no RN rendering test environment, per the established, repeatedly-applied pattern from Modules 4-5). Verified via `tsc --noEmit`, the full Jest/Vitest suites staying green, and — same open constraint as every prior module — no deployed-Worker live spot-check is possible from a fresh dev checkout, though this session specifically now has a real deployed Worker with working Anthropic credits (unlike prior modules), so a live spot-check via `expo start --web` (gallery-pick path) or the already-built EAS preview APK is realistically possible this time and should be done before considering this feature verified.

## Out of scope (deferred / not planned)

- Persisting suggested names anywhere (they're a one-time prompt at recognition time, same as how the `isEstimated` flag's *source* — AI guess vs. manual — isn't separately tracked beyond the boolean itself).
- Suggestions for the fully-manual "+ Add dish" path (no photo, so nothing to suggest from) — chips only ever appear after a photo recognition, exactly as portion estimates only ever appear that way today.
- Any change to the ingredient-matching/unmatched-routing flow (`PhotoReviewScreen`, product-creation detour) — entirely untouched, since suggestions are additive and orthogonal to ingredient identification.
