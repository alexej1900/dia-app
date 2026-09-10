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

**Your product names are also sent with the photo.** Alongside the dish photo, the app
sends the names of the products in your own product database to the same server, so the
recognition result can be matched against your own catalog. No other product data (such
as carb values) is included.

**Everything else stays on your device.** Your carb values, ingredient weights, dish
records, and any notes about which ingredient weights were AI-estimated vs. manually
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

Dish photos (and your product names, as described above) are processed by
[Anthropic](https://www.anthropic.com/legal/privacy)'s Claude API, via the app
developer's own server. Separately, if you use the optional "look up carbs" feature on
the product form, the product name you're searching for is sent to
[Open Food Facts](https://world.openfoodfacts.org), a free/open product database, to
retrieve its carb value — this only happens when you explicitly tap that button, not
automatically. No other third-party service receives any data from the app.

## Data retention and deletion

Since all of your data (other than a dish photo at the moment you submit it for
recognition) lives only on your device, uninstalling the app deletes it. There is no
server-side account or record to separately request deletion of.

## Changes to this policy

If this policy changes, the update will be posted here with a new "Last updated" date.

## Contact

Questions about this policy: [contact email]
