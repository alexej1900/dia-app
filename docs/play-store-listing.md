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
