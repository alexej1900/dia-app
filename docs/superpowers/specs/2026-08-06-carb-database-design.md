# Module 1: Local Carbohydrate Database — Design

Date: 2026-08-06

## Context

DIA-APP is a mobile app (Android, published via Google Play) for people with diabetes. Core product idea: point the phone camera at a finished dish (or take a photo), and the app estimates the dish's total carbohydrate content to help calculate an insulin dose.

The project is split into 5 parts, built in order:

1. **Local carbohydrate database** (this document) — a manually-entered reference of products/dishes.
2. Dish recognition from photo (CV/ML).
3. Portion/volume estimation from photo.
4. Total carb calculation (combines 2+3+1).
5. App shell and Google Play publishing.

This document covers module 1 only.

## Architecture

- **Stack**: Expo (React Native + TypeScript). Chosen because the developer is familiar with React/TS and has no prior native mobile experience. Expo gives a fast start (Expo Go), ready-made camera/SQLite modules for later stages, and Google Play build/publish via EAS Build without manual native environment setup.
- **Storage**: `expo-sqlite` — local SQLite database on-device. Fully offline except for the optional network lookup described below.
- **Navigation**: React Navigation, bottom tabs — **PRODUCTS** and **DISHES**.
- **Data layer**: repository pattern (`productsRepo`, `dishesRepo`) over SQLite — screens never touch SQL directly, only typed CRUD functions.

## Data Model

```ts
// Products (reference list)
Product {
  id: string
  name: string
  carbsPer100g: number   // >= 0
  isSeed: boolean         // true for preloaded entries (for info/filtering)
  createdAt, updatedAt
}
// Computed UI field (not stored in DB):
// gramsPerW = carbsPer100g > 0 ? 1000 / carbsPer100g : null
// where W is the project's label for the "bread unit" (XE); 1 W = 10g of carbs.

// Dishes
Dish {
  id: string
  name: string
  items: DishItem[]
  createdAt, updatedAt
}
DishItem {
  productId: string   // FK -> Product, ON DELETE RESTRICT
  grams: number         // > 0
}
// Computed fields:
// totalCarbs = Σ(product.carbsPer100g * item.grams / 100)
// totalWeight = Σ(item.grams)
// totalW = totalCarbs / 10
```

Deleting a product is blocked (`RESTRICT`) if it is used in at least one dish. The app shows the list of dishes that use the product and prevents deletion until the product is removed from all of them.

## Screens and Behavior

### PRODUCTS

- List with search by name (`FlatList` + search field), alphabetically sorted.
- Tapping an entry opens the edit form. A "+" button opens the add form.
- Form fields: name (required, non-empty), carbs per 100g (number ≥ 0). Below the field, a live preview shows "N g = 1 W" (`1000 / carbsPer100g` when `carbsPer100g > 0`, otherwise a dash).
- A **"Look up carbs"** button next to the carbs field lets the user search the value online if they don't know it (see below).
- Deletion via swipe/button, with the in-use check described above.
- On first launch, the database is preloaded with a set of common products (bread, rice, potato, etc.) and their carb content. Preloaded entries can be edited and deleted like any other, subject to the same in-use restriction.

### DISHES

- List with search by name.
- Tapping an entry opens the edit form. A "+" button opens the add form.
- Form fields: name, then a list of ingredients — pick a product from the PRODUCTS reference (via search) and enter its weight in grams. Ingredient rows can be added or removed.
- Bottom of the form shows a live total: total weight (g), total carbs (g), total **W**.

### Online carb lookup (Open Food Facts)

- Data source: [Open Food Facts](https://world.openfoodfacts.org) — a free, key-less REST API with an international database that includes Russian products.
- Request: `GET /cgi/search.pl?search_terms=<name>&fields=product_name,brands,nutriments&json=1`, using the value currently in the product form's "Name" field.
- Results are shown in a modal list: name + brand + carbs/100g for each match. Products with no carb data are excluded from the list.
- Tapping a result fills the "Carbs per 100g" field — the field stays editable and nothing is auto-saved.
- Error handling:
  - no network/request failure → error message, button disabled while offline;
  - no results → "Nothing found, enter manually" message.

## Validation and Errors

- Empty product/dish name blocks saving, with an inline hint.
- Negative or non-numeric carbs/weight values block saving.
- A dish with zero ingredients blocks saving.
- All data operations are synchronous and local (SQLite); the network is used only optionally, for the carb lookup feature.

## Testing

- Unit tests (Jest) for pure calculation functions: `carbsToW`, `dishTotals`, `gramsPerW`.
- Unit tests for the repository layer: CRUD operations and the `RESTRICT` check on deleting a product in use.
- UI is verified manually via Expo Go on an Android emulator/device (automated UI tests are out of scope for this module).

## Out of Scope for This Module

- Dish recognition from photo, portion/volume estimation, automatic photo-based calculation — modules 2-4 of the roadmap.
- Google Play publishing, native build setup — module 5 of the roadmap.
- Cross-device/account data sync — not planned.
