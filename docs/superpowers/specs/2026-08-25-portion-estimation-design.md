# Portion/Volume Estimation from Photo — Design Spec

Module 3 of the DIA-APP roadmap (see `docs/superpowers/specs/2026-08-06-carb-database-design.md` for Module 1, and `docs/superpowers/specs/2026-08-08-dish-photo-recognition-design.md` for Module 2, which this module builds on).

## Purpose

Module 2 identifies *which* ingredients are in a dish photo, but leaves each ingredient's weight blank for the user to type in manually. Module 3 has the app estimate *how much* of each recognized ingredient is present (in grams), pre-filling that field instead of leaving it blank — while making clear it's an estimate the user can and should review, since it feeds an insulin-dose calculation (Module 4).

## Chosen approach

A 2D photo doesn't give true real-world scale or volume. Three approaches were considered:

1. **Vision-model judgment only** (chosen) — extend the existing Claude vision call to also estimate grams per ingredient, using the model's general knowledge of typical portion/plate/bowl sizes and food density. No physical reference object required.
2. Reference-object calibration (e.g. a coin or credit card in the photo, used to establish pixel-to-cm scale) — more accurate in principle, but adds a UX step the user must remember, plus real geometric estimation complexity (camera angle, depth) well beyond this module's scope.
3. No estimation, model gives a textual suggestion only, grams field stays blank — rejected as not meaningfully different from today's Module 2 behavior.

Approach 1 was chosen: it reuses the single reasoning call already made for recognition (per Module 2's precedent), adds no new latency/cost/failure modes, and keeps the module's scope to a prompt/schema extension plus a UI prefill rather than new geometry/computer-vision code. Its accuracy ceiling is a model "eyeballing it," which is why the UI must clearly flag the value as an estimate rather than present it as measured fact.

## Architecture

Module 3 extends Module 2's existing pipeline; no new network calls or endpoints are introduced.

```
DishFormScreen -> PhotoRecognitionButton -> Worker POST /recognize (same call site as Module 2)
  Claude tool call gains one more field per item: estimatedGrams (int | null)
  <- { items: [{ name, matchedProductName, estimatedGrams }] }
PhotoReviewScreen: same checklist UI as Module 2, carries estimatedGrams through unchanged
DishFormScreen.addIngredient: grams field is prefilled with the estimate (rounded to the nearest gram),
  flagged as an estimate until the user edits it — editing clears the flag, and from then on it's
  treated as a normal manually-entered value
```

### Type changes

- `RecognizedItem` (shared by `worker/src/recognize.ts` and `src/services/dishRecognition.ts`) gains `estimatedGrams: number | null`.
- `PhotoReviewScreen`'s confirm callback shape changes to carry the estimate through:
  - `matchedProducts`: `Product[]` → `{ product: Product; estimatedGrams: number | null }[]`
  - `unmatchedNames`: `string[]` → `{ name: string; estimatedGrams: number | null }[]`
- `DishFormScreen`'s `pendingUnmatchedNames` state changes to match the new unmatched shape, so the estimate survives the "route unmatched item through the product-creation form" detour before it becomes a dish ingredient.
- `IngredientRow` (DishFormScreen local state) gains `isEstimated: boolean`.

## Worker & prompt design

`worker/src/recognize.ts`'s tool schema gains one field on each item:

```ts
estimatedGrams: {
  type: ['integer', 'null'],
  description: "Your best-guess weight of this ingredient's visible portion in grams, " +
    "based on typical portion sizes, plate/bowl scale, and food density. " +
    "Null if you cannot judge it from the photo."
}
```

The prompt text gains one added instruction asking the model to estimate each portion's weight in grams using ordinary visual cues (plate/bowl size, how full a container looks, typical serving sizes for that kind of food), since no physical reference object is provided in the photo.

No change to model choice (`claude-haiku-4-5`) or the one-call-per-photo cost/latency shape — this remains a single bounded structured-output call with a wider schema, not an additional call.

`parseAnthropicToolResult` is extended to read and pass through `estimatedGrams`, treating anything that isn't a valid positive number (missing, `null`, `0`, negative, non-numeric) as `null` — the same "fail soft" handling already used for an unmatched product name.

## UI

In `DishFormScreen`'s ingredient row, an estimated grams value renders visually distinct from a manually-entered one — muted/italic text with a small suffix such as "(estimated)" — using the existing `TextInput`, so it stays directly editable. The moment the user types into that field, `isEstimated` clears and the row renders as a normal value from then on, with no further visual distinction. `PhotoReviewScreen`'s checklist UI itself is unchanged — it doesn't show or edit grams.

## Error handling

No new error states are introduced. If `estimatedGrams` comes back `null`/missing for a given item, that ingredient's grams field starts blank exactly as it does today, with no `isEstimated` flag. This module only adds a "happy path" prefill on top of Module 2's existing error handling (network failure, timeout, auth, malformed response), none of which changes.

## Testing & verification

- **Unit tests** (Jest, extending the existing suites in both `worker/` and the app): `estimatedGrams` present/null/invalid → schema building and response parsing; `DishFormScreen`/`PhotoReviewScreen` prefill behavior, `isEstimated` flag setting, and flag-clears-on-edit behavior, run against fixture data.
- **Manual/E2E verification** carries the same open constraint Module 2 left behind: no deployed Cloudflare Worker or live Anthropic API key exists in this dev environment, so live estimation quality itself cannot be exercised here. Only the wiring — a fixture `estimatedGrams` value flowing through to the prefilled/flagged grams field — can be checked via the gallery-pick web path (`expo start --web` + chrome-devtools MCP), consistent with how Module 2 was verified.

## Out of scope (deferred / not planned)

- Reference-object or camera-calibration-based measurement (e.g. coin/card-based pixel scale, depth estimation).
- Per-item confidence scores on the estimate.
- A dish-level "totals include unverified estimates" warning banner.
- Combining recognition + portion into a final carb total (Module 4).
- Persisting the "estimated" flag past save — today it exists only in the dish form's in-memory state and is lost once the dish is saved (whether or not the user reviewed/edited the value). Module 4, which computes the final carb/dose-relevant total, must not assume that a saved dish's grams values were user-verified rather than AI guesses; this is a known gap this module intentionally does not close, since fixing it needs a schema change (an `is_estimated` column on `dish_items` + migration) that's out of this module's scope.
