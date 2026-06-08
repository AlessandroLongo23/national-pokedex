# Bulk buy ("card lots") — design

**Date:** 2026-06-08
**Status:** Approved (design), pending implementation

## Problem

Today you can record acquisitions one of two ways: open a **pack** (pick cards
from a single set's grid, log a total price) or log a **single purchase** (one
card, a unit price). Neither fits a **bulk buy** — a lot of arbitrary cards
spanning many sets, bought together for one combined price (a collection
binder off Facebook, a job lot at a show, a friend's box of dupes).

We want the pack-opening experience — a card grid you click through to build a
selection, then a price at the end — but over the **entire card catalogue**
instead of one set, saved as **one combined purchase**.

## Decisions (locked with the maintainer)

1. **One combined "lot".** A bulk buy is a single ledger transaction for the
   total paid, editable and deletable as a unit (like a pack). Cost-basis stays
   at the ledger-aggregate level — the portfolio sums purchase transactions vs.
   market value and does **not** attribute cost per card, so no price-splitting
   is needed.
2. **Per-card quantities.** A lot can hold multiple copies of the same card.
   Selection is `Map<cardId, qty>`, not a `Set`.
3. **Launched from Transactions.** A "Log a bulk lot" button joins the
   Transactions `ActionsBar` (beside Log singles / Log sale / New PSA). Past
   lots appear as rows in the Transactions ledger; a row's Edit opens a
   full-page editor. No new top-level nav section.

## Approach (chosen)

A new **card lot** domain object that mirrors the pack architecture: a pack
minus the set, plus a per-card quantity. Rejected alternatives:

- **Nullable `set_id` on `packs_opened`** ("setless pack") — pollutes the whole
  packs domain (`PackHistory`, portfolio recent-packs strip, breadcrumbs,
  `BestPack` all assume a set). A lot is not a sealed pack.
- **N `single_purchase` rows sharing a tag** — contradicts decision 1; no
  single object to open and edit.

## Data model

### New tables (RLS scoped by `user_id`, same policies as `packs_opened` / `pack_contents`)

`card_lots` — `packs_opened` minus `set_id`:

| column        | type          | notes                                   |
| ------------- | ------------- | --------------------------------------- |
| `id`          | uuid pk       | `gen_random_uuid()`                     |
| `user_id`     | uuid          | FK `auth.users`, RLS key                |
| `purchased_at`| timestamptz   | defaults `now()`; backdatable in the UI |
| `cost_cents`  | int null      | nullable, like pack cost                |
| `currency`    | text null     | `'USD' | 'EUR'`; null when cost is null |
| `rate_to_eur` | numeric null  | FX snapshot at log time                 |
| `created_at`  | timestamptz   | `now()`                                 |

`lot_contents` — `pack_contents` plus a quantity:

| column     | type     | notes                          |
| ---------- | -------- | ------------------------------ |
| `lot_id`   | uuid     | FK `card_lots` on delete cascade |
| `card_id`  | text     | catalogue id                   |
| `quantity` | int      | `>= 1`, check constraint       |

Primary key `(lot_id, card_id)`. Realtime: not required (the editor reloads on
navigation), matching the pack-edit page which doesn't subscribe.

### Ledger

- Add `'lot_purchase'` to `TRANSACTION_KINDS` (`lib/ledger/aggregates.ts`).
- Add a nullable `lot_id` FK column on `transactions` (mirrors `pack_id`), with
  an on-delete cascade so deleting the lot removes its ledger row — exactly the
  `pack_id` pattern.
- A lot with a cost mirrors into **one** `lot_purchase` row of `-cost_cents`.
  `computeKpis` already treats any negative amount as spend, so the new kind
  flows into "total spent" and net position with no aggregate changes.

### RPC changes

1. **`owned_cards_apply_deltas(_user_id uuid, _card_ids text[], _deltas int[])`**
   — new sibling of `owned_cards_apply_delta`. Applies a *parallel* per-card
   delta (qty 2→3 = +1, removed = −old, added = +new), upserts on increase,
   floors at zero with row-delete on decrease. Needed because lots carry
   per-card quantities; the existing single-delta RPC can't express that.
2. **Extend `owned_cards_resync_acquired_at`** to add lots as a third
   acquisition source: `MIN(card_lots.purchased_at)` over a card's lots, folded
   into the existing `least(pack source, single-purchase source)`. So a card
   acquired only via a backdated lot still derives the correct `acquired_at`.
   No backfill needed (no existing lots).

## Server actions — `app/(dashboard)/_lib/lot-actions.ts`

Cloned from `pack-actions.ts`, set logic removed, quantities added.

- **`logCardLot(cardIds: {cardId, quantity}[], cost?)`** → `{ lotId, newCards }`.
  Insert `card_lots`; insert `lot_contents`; bump `owned_cards` via
  `owned_cards_apply_deltas` (+qty per card); resync `acquired_at`; if cost,
  snapshot `rate_to_eur` (`getRateToEurToday`) and write the `lot_purchase`
  transaction via a `syncLotPurchaseTransaction` helper. `newCards` = count of
  cards that went qty 0 → ≥1 (for the success toast).
- **`updateCardLot(lotId, cardIds, options)`** → `{ newCards }`. Diff existing
  `lot_contents` against the new selection by `(card_id, quantity)`: compute a
  per-card net delta, write the contents (upsert changed, delete removed),
  apply the deltas, resync `acquired_at` for the union, and re-sync the ledger
  row when cost/date changed. Mirrors `updatePack`'s structure.
- **`deleteCardLot(lotId)`**. Decrement `owned_cards` by each card's stored qty,
  delete the lot (ledger row cascades via `lot_id` FK), resync `acquired_at`.
- **`syncLotPurchaseTransaction(...)`** — delete-then-insert the single
  `lot_purchase` row from the lot's current cost/currency/date/rate, idempotent
  (no row when cost is null). Same shape as `syncPackPurchaseTransaction`.

All actions call `requireUserId()`, scope every query by it, and
`revalidatePath('/transactions')`, `/portfolio`, `/collection`.

Validation: Zod, reusing the `MAX_COST_CENTS` guard. `cardIds` capped (e.g. 2048
distinct), `quantity` 1–99 per card.

## UI

### Routes (mirror `/transactions/psa/[id]`)

- `app/(dashboard)/transactions/lots/new/page.tsx` — create.
- `app/(dashboard)/transactions/lots/[lotId]/edit/page.tsx` — edit (loads the
  lot + its contents, passes them to the flow).

### `ActionsBar`

Add a fourth action, **"Log a bulk lot"** (a `Link` to `/transactions/lots/new`,
not a modal — the catalogue browser is a full page). Icon: `Layers` /
`PackageOpen`.

### `LogLotFlow` component — catalogue browser ⨉ pack flow

State: `Map<cardId, qty>` selection; `costCents`/`currency`; `purchasedAtLocal`;
dirty + `beforeunload` guard (reused from `LogPackFlow`).

Layout (top → bottom):

```
┌──────────────────────────────────────────────────────────┐
│ Bulk lot          [💲 Paid €120.00 ▾] [📅 Jun 8 ▾] [Clear]│  context bar
├──────────────────────────────────────────────────────────┤
│ [picked tray: thumb ⊖ 2 ⊕  thumb ⊖ 1 ⊕  …]               │  steppers
├──────────────────────────────────────────────────────────┤
│ [ Filters toolbar: search · set · rarity · type · dex …]  │  reuse CardFiltersToolbar
│ ┌────┐┌────┐┌────┐┌────┐┌────┐  (virtualized, selectable, │
│ │ ②  ││    ││    ││ ①  ││    │   qty badge + steppers)     │  reuse VirtualizedCardGrid (extended)
│ └────┘└────┘└────┘└────┘└────┘                            │
├──────────────────────────────────────────────────────────┤
│ 14 cards · 22 copies                      [ Save lot (22) ]│  sticky footer
└──────────────────────────────────────────────────────────┘
```

Component reuse:

- **`CardFiltersToolbar`** + the `applyFilters` logic from `CardsBrowser` —
  lifted into a shared helper so both the catalogue page and the lot flow filter
  identically (debounced search over ~20k cards).
- **`VirtualizedCardGrid`** — extended with *optional* selection props
  (`selected: Map<string, number>`, `onToggle`, `onSetQty`). When absent it
  renders read-only exactly as today (the `/cards` page is untouched). When
  present, tiles render a quantity badge + +/− controls; first click sets qty 1.
  A selectable `CardTile` variant carries the badge/steppers.
- **Picked tray** + **`PricePaidField`** + sticky footer — adapted from
  `LogPackFlow`; the tray gains per-card steppers. A new **`PurchasedAtField`**
  generalises `OpenedAtField` ("Purchased" vs "Opened"); consider extracting one
  shared date-popover.

Edit mode pre-loads contents+quantities, diffs on save (`+added / −removed /
qty changes` summary in the footer), and offers **Empty → delete** when the
selection is cleared, exactly like `LogPackFlow`.

### Ledger integration (Transactions page)

- `transactions/page.tsx`: add `lot_id` to the `transactions` select; build a
  `lotCardCount` map (group `lot_contents` by `lot_id`, like `psaCardCount`);
  add `lotId` + `lotCardCount` to `LedgerTableRow`.
- `LedgerTable`: `KIND_LABEL.lot_purchase = "Bulk lot"`; the row description
  reads e.g. *"Bulk lot · 14 cards"*. `lot_purchase` is **not** a
  `SelectableKind` (no bulk-delete), same as packs.
- `LedgerRowActions`: new `lot_purchase` case → Edit links to
  `/transactions/lots/${lotId}/edit` (mirrors the `pack_purchase` edit link).

## Testing

- **Unit (Vitest):** `computeKpis` includes `lot_purchase` as spend; the
  contents-diff helper in `updateCardLot` (added/removed/qty-changed →
  per-card deltas) as a pure function extracted for testability.
- **RPC behaviour:** `owned_cards_apply_deltas` increments/decrements/floors
  correctly; `owned_cards_resync_acquired_at` picks the earliest across pack,
  single, and lot sources. (Exercised via the actions where a live Supabase test
  client exists; otherwise pure-function coverage of the diff math.)
- **E2E (Playwright):** log a lot of 3 cards across 2 sets with quantities + a
  price → appears as one `lot_purchase` row reading "Bulk lot · 3 cards", the
  cards are owned with the right quantities, and total-spent reflects the cost;
  edit the lot (bump a quantity, change the price); delete it (cards decrement,
  ledger row gone). Use the OTP-cookie auth pattern from the project memory.

## Out of scope (YAGNI)

- Per-card cost attribution / price-splitting (portfolio is aggregate-level).
- A lot "note"/source field (kept at parity with `packs_opened`; easy later).
- A dedicated "Bulk buys" history page (Transactions is the history).
- Realtime subscription on lots.
- A global FAB entry (Transactions button only, per decision 3).
