# Dish Photo Recognition — Design Spec

Module 2 of the DIA-APP roadmap (see `docs/superpowers/specs/2026-08-06-carb-database-design.md` for Module 1, the local carb database this module builds on).

## Purpose

Let the user photograph a dish (or pick an existing photo) and have the app identify which ingredients are in it, so they don't have to manually search and add each one when creating a dish. This module only identifies *which* ingredients are present — estimating *how much* of each (portion/volume) is explicitly out of scope, deferred to Module 3.

## Architecture

```
DishFormScreen (app)
  -> expo-image-picker (camera or gallery)
  -> expo-image-manipulator (resize/compress before upload)
  -> POST /recognize on Cloudflare Worker
       -> Anthropic API (Claude, vision + tool-use)
       <- structured JSON: recognized ingredients + matches against caller's product list
  <- { items: [{ name, matchedProductName | null }] }
  -> Review screen (checkboxes)
  -> confirmed matched items added to dish ingredient list
  -> confirmed unmatched items routed through existing "add product" form
```

The Anthropic API key is never shipped in the app. It lives only as a secret on the Cloudflare Worker, which acts as a thin authenticated proxy between the app and Claude's API.

## Ingredient matching

The Worker sends the current list of the user's product names to Claude in the same vision request and asks it to identify ingredients in the photo *and* match each one against that list (existing product name, or `null` for "new ingredient not in the catalog"). This was chosen over local fuzzy-string matching in the app because:

- It reuses the single reasoning call already being made for recognition — no separate matching pass or new dependency.
- LLM-based matching handles real-world naming variance ("chicken breast" vs. "grilled chicken breast") better than simple string similarity.
- The product catalog is personal-scale, so prompt growth from including it is not a practical concern.

## Backend proxy (Cloudflare Worker)

**Contract:**
```
POST /recognize
Headers: X-App-Secret: <shared secret>
Body: { image: string (base64 JPEG), productNames: string[] }

200 OK: { items: [{ name: string, matchedProductName: string | null }] }
4xx/5xx: { error: string }
```

- The Worker builds a Claude vision request: an image content block plus a tool-use schema that forces the response into the exact `items` shape above (no free-text parsing needed).
- **Auth:** the app sends a static shared-secret header, embedded in the app build alongside the Worker URL. This is a deterrent, not a strong security boundary — a determined person could extract the secret from the app binary, the same way any client-embedded secret can be extracted. It is sufficient for the actual threat here (an idle scanner or accidental discovery of the URL burning through Anthropic quota), not for a public product with a paying-customer-grade threat model.
- **Rate limiting:** Cloudflare's built-in rate limiting is applied to the route as a second layer of abuse protection.
- The Anthropic API key is stored only as a Worker secret (`wrangler secret put`), never committed or shipped to the client.

**Prerequisites the user needs before this module can be deployed:** an Anthropic API key, and a Cloudflare account to host the Worker.

## Image handling

Mobile photos can be several MB. Before upload, the app resizes/compresses the image client-side via `expo-image-manipulator` (cap at ~1024px on the longest edge, JPEG quality ~0.7) to reduce upload time and per-call cost.

## UI flow

1. **Entry point:** a "Recognize from photo" button on `DishFormScreen`, next to the existing manual product search field.
2. **Photo source:** tapping the button shows an action sheet — *Take Photo* / *Choose from Gallery* — via `expo-image-picker`.
3. **In flight:** the button shows a loading state while the image is resized, uploaded, and Claude responds.
4. **Review screen:** a new screen listing each recognized ingredient as a checkbox row, checked by default. Matched items show the existing product's name. Unmatched items are visually flagged (e.g. "New: sautéed spinach"). The user can uncheck anything before confirming.
5. **On confirm:**
   - Checked **matched** items are added to the dish's ingredient list exactly as manual search-add does today (grams field starts blank — the user fills it in; portion estimation is Module 3's job).
   - Checked **unmatched** items are routed into the existing "add product" form (name pre-filled, Open Food Facts lookup still available from Module 1). Once saved, each is added to the dish as an ingredient.

## Error handling

Shown inline using the same `error` state pattern already used in `DishFormScreen`:

| Condition | Message |
|---|---|
| No network / Worker unreachable | "Could not reach recognition service. Check your connection." |
| Worker/Anthropic error or malformed response | "Recognition failed. Try again or add ingredients manually." |
| Camera/gallery permission denied | "Camera/photo access is needed for this feature." (after the native OS permission prompt) |
| Zero ingredients recognized | Review screen shows "No ingredients recognized" with a way to dismiss and add manually. |

## Testing & verification

- **Unit tests** (Jest, following the existing `__tests__/` convention): response-parsing logic, matched/unmatched shaping, error-condition mapping — run against fixture responses, no real network calls.
- **Worker logic** (auth header check, request shaping) is kept simple enough to unit test without hitting the live Anthropic API.
- **Manual/E2E verification:** no Android SDK/emulator exists in this dev environment and native camera capture cannot be exercised here (see project memory on device testing constraints). However, `expo-image-picker`'s gallery path resolves to a browser file input on web, so the gallery half of this flow — pick file → send to Worker → review screen → add to dish — can be verified via `expo start --web` + chrome-devtools MCP, the same approach used for Module 1. Native camera capture remains an open, non-blocking caveat, consistent with how Module 1 left native-only gesture behavior unverified.

## Out of scope (deferred to later modules)

- Estimating ingredient quantity/portion from the photo (Module 3).
- Combining recognition + portion into a final carb total (Module 4).
