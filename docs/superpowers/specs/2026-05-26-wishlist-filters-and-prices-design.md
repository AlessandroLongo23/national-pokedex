# Wishlist filters and price display — design

Date: 2026-05-26
Scope: `/wishlist` page only (Cards page behavior unchanged).

## Goal

The Wishlist page currently renders a flat grid with sort controls only and no
price information. Make it filter-rich and price-aware so the user can answer
questions like "which sub-$5 Kanto cards do I still want?" without scrolling
500 cards.

Two user-visible additions:

1. A filter toolbar shaped like the Cards page, plus new dimensions for price
   bucket, generation (region), and regional form.
2. The market price displayed below each card image (already supported by
   `CardTile`; just needs a `CardPricesProvider` upstream).

All filter dimensions combine with AND across dimensions and OR within a
multi-select dimension, matching the existing Cards-page convention.

## Non-goals

- Adding price / generation / regional-form filters to the Cards page. The
  shared toolbar will support them behind feature flags, but the Cards page
  keeps its current filter set in this change.
- Persisting filter state across navigation (matches current Cards behavior).
- A price range slider, Mega/Gigantamax form filter, or alternate price
  sources beyond TCGplayer / Cardmarket. These are easy follow-ups.

## Architecture

### File moves

Promote the toolbar from a Cards-only path to a shared `_components` path so
Wishlist can import it without crossing route-group boundaries:

```
app/(dashboard)/cards/_components/CardsFiltersToolbar.tsx
  -> app/(dashboard)/_components/CardFiltersToolbar.tsx
```

Cards page updates its import; no other Cards-page change.

### Shared filter state shape

`CardsFilterState` in the moved file gains three optional dimensions:

```ts
export interface CardsFilterState {
  search: string;
  supertype: SupertypeFilter;
  setIds: Set<string>;
  rarities: Set<Rarity>;
  types: Set<string>;
  artist: string | null;
  dexFrom: number | null;
  dexTo: number | null;

  // New — populated when the toolbar's corresponding flag is on.
  priceBuckets: Set<PriceBucket>;   // "<1" | "1-5" | "5-20" | "20+" | "none"
  generations: Set<Generation>;     // 1..9 (matches existing Generation type)
  regionalForms: Set<RegionalForm>; // "Alolan" | "Galarian" | "Hisuian" | "Paldean"
}
```

`emptyFilters()` initializes all three sets to empty. `isFiltersDirty()`
treats any non-empty set as dirty.

### Toolbar feature flags

```ts
interface ToolbarFeatures {
  showPrice?: boolean;        // default false
  showGeneration?: boolean;   // default false
  showRegionalForm?: boolean; // default false
}
```

The flag-gated controls render on a new third row beneath the existing two
rows. The Cards page passes no flags (all defaults), so its UI is byte-for-byte
unchanged. The Wishlist page passes all three flags `true`.

### Wishlist page wiring

[wishlist/page.tsx](../../../app/(dashboard)/wishlist/page.tsx):

1. After resolving `cards`, call `fetchPricesForCards(cards.map(c => c.id))`
   (already exists in [lib/pricing/pokemontcg.ts](../../../lib/pricing/pokemontcg.ts)).
2. Serialize the result to `Record<string, CardPrice>`.
3. Pass `cards` and `prices` to `WishlistClient`.

[wishlist/WishlistClient.tsx](../../../app/(dashboard)/wishlist/WishlistClient.tsx)
replaces its current `<CardGrid …/>` body with:

1. `<CardPricesProvider prices={prices}>` wrapper.
2. The shared `<CardFiltersToolbar …/>` with `showPrice/showGeneration/showRegionalForm` on.
3. A virtualized or simple grid (use the same `VirtualizedCardGrid` Cards uses,
   to keep behavior identical; the existing `CardGrid` doesn't accept a
   `cols`-controlled external state).
4. A local `applyWishlistFilters()` that runs the existing Cards filters plus
   the three new dimensions.

`CardTile` already renders price inline when a `CardPricesProvider` is in
scope, so no `CardTile` change is needed.

### New filter semantics

**Generation (region) — multi-select chips.** Labels and mapping:

| Chip          | Generation | Dex range |
| ------------- | ---------- | --------- |
| Kanto         | 1          | 1–151     |
| Johto         | 2          | 152–251   |
| Hoenn         | 3          | 252–386   |
| Sinnoh        | 4          | 387–493   |
| Unova         | 5          | 494–649   |
| Kalos         | 6          | 650–721   |
| Alola         | 7          | 722–809   |
| Galar / Hisui | 8          | 810–905   |
| Paldea        | 9          | 906–1025  |

A card matches if any `dex[]` entry's generation (via existing `genOf()` in
[lib/data/types.ts](../../../lib/data/types.ts)) is in the selected set.

**Regional form — multi-select chips.** `Alolan | Galarian | Hisuian | Paldean`.
Detected by prefix-matching `card.name` with one space:

```ts
function regionalFormOf(card: CardEntry): RegionalForm | null {
  if (card.name.startsWith("Alolan ")) return "Alolan";
  if (card.name.startsWith("Galarian ")) return "Galarian";
  if (card.name.startsWith("Hisuian ")) return "Hisuian";
  if (card.name.startsWith("Paldean ")) return "Paldean";
  return null;
}
```

A card matches if `regionalFormOf(card)` is in the selected set. Lives in a
new helper file `app/(dashboard)/_lib/regional-form.ts`.

**Price buckets — multi-select chips.** Buckets are inclusive-low / exclusive-high,
defined in the user's selected price source currency:

| Chip      | Range                  |
| --------- | ---------------------- |
| `< $1`    | `0 < p < 1`            |
| `$1–5`    | `1 <= p < 5`           |
| `$5–20`   | `5 <= p < 20`          |
| `$20+`    | `p >= 20`              |
| No price  | card has no price row  |

The currency symbol on the chips follows `priceSource` from `UserContext` (`$`
for tcgplayer, `€` for cardmarket). Boundaries stay numeric (no FX
conversion). A card matches if its current-source price falls in any selected
bucket, or if "No price" is selected and `pickPrice(...)` returns `undefined`.

The toolbar component only renders the chip controls; it reads `priceSource`
from `UserContext` purely to label the chips with the right currency symbol.
The actual bucket predicate runs in `applyWishlistFilters` (in
`WishlistClient`), which already has access to the prices map and price
source. Keeping the toolbar pricing-unaware lets the Cards page render the
same toolbar component with `showPrice: false` and no provider above it.

## Data flow

```
WishlistPage (server)
  ├─ requireUserId
  ├─ supabase wishlist_cards rows
  ├─ loadCardsByIds → CardEntry[]
  └─ fetchPricesForCards(ids) → Map<string, CardPrice>
                                      ↓ (serialize)
WishlistClient (client)
  └─ CardPricesProvider
       └─ CardFiltersToolbar (full feature flags)
            └─ VirtualizedCardGrid (sorted + filtered)
                 └─ CardTile (reads price from provider)
```

## Edge cases

- **No price provider on Cards page.** The toolbar must not assume a price
  provider exists. The price bucket controls only render when `showPrice`
  is on; the predicate consults `useCardPrices()` and treats `null` as "no
  cards have prices" (everything matches "No price").
- **Empty filtered result.** Show "No cards match these filters." with a
  Clear-filters button. Currently the page shows a different empty state for
  "nothing wishlisted at all" — keep that one for `cards.length === 0` and
  add the new one when `cards.length > 0 && visible.length === 0`.
- **Wishlist context drift.** The current `useMemo(() => cards.filter(c => wishlist.has(c.id)))`
  still runs first; filter pipeline operates on the wishlist-reconciled set.
- **Prices fail to fetch.** `fetchPricesForCards` returns an empty Map on
  network error (existing behavior). All cards then fall into the "No price"
  bucket. UI degrades gracefully.

## Testing

- Unit test the `regionalFormOf` helper on a few real card names.
- Unit test the bucket predicate (boundary values: 0.99 / 1.00 / 4.99 / 5.00
  / 19.99 / 20.00; undefined).
- Snapshot or render test that `CardFiltersToolbar` with no feature flags
  renders identically to the previous Cards toolbar (regression guard).
- Existing Cards page e2e (if any) must still pass.

## Migration notes

- The import path change is one-line. No data migration.
- New fields on `CardsFilterState` are non-optional `Set`s — any external
  callers (currently only `CardsBrowser`) must construct them via
  `emptyFilters()` (already used).
