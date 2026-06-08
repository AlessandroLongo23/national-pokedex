# Group single purchases into a bulk lot — design

**Date:** 2026-06-08
**Status:** Approved (design), pending implementation
**Builds on:** [2026-06-08-bulk-buy-lots-design.md](2026-06-08-bulk-buy-lots-design.md)

## Problem

A user often logs cards one at a time as `single_purchase` rows, then realises
several of them were really one bulk buy (a binder lot, a job lot). They want to
select those single-purchase rows in the Transactions ledger and **consolidate**
them into a single bulk lot — the same `card_lots` object created from scratch by
the bulk-buy feature.

## Decisions (locked with the maintainer)

1. **Consolidate (replace).** The selected singles are removed from the ledger
   and replaced by ONE `lot_purchase` row. Total spend and owned-card counts stay
   identical; the ledger just shows one lot instead of N singles.
2. **Open the lot editor pre-filled.** Grouping launches the existing `LogLotFlow`
   (create mode) loaded with the cards, combined quantities, a suggested combined
   total, and the date — plus the IDs of the singles being consumed. The user can
   change anything (price, currency, cards, quantities, date). On **Save** the lot
   is created AND the source singles are deleted, atomically.
3. **Mixed currency → majority currency.** The suggested total is computed by
   converting every selected single into the currency that appears most often
   among the selection (tie → either), then summing. Price and currency remain
   fully editable in the editor. (Same-currency selections are the common case and
   need no conversion.)

## Eligibility

Only `single_purchase` rows can be grouped. The "Group into bulk lot" action is
shown/enabled only when **every** selected ledger row is a `single_purchase`
(≥1 selected). Sales/packs/PSA/existing-lot rows are not groupable; if the
selection contains any non-single, the group action is hidden (Delete still works).

## Ownership accounting (the correctness core)

Each consumed single already contributed `+quantity` to `owned_cards`. The new lot
contributes `+lot_quantity`. So when saving, `owned_cards` must change by the **net**
delta per card:

```
net_delta(card) = final_lot_qty(card) − Σ consumed_single_qty(card)
```

For a pure group (the editor unchanged from the pre-fill), `final_lot_qty` equals
`Σ consumed_single_qty` for every card, so every delta is **0** and ownership is
untouched. If the user edits quantities or adds/removes cards in the editor, the
non-zero deltas keep ownership correct. The delta is applied with the existing
`owned_cards_apply_deltas` (delete-to-zero-first) semantics.

## Architecture

### Entry point — `LedgerSelectionBar`

Add a **"Group into bulk lot"** button (icon `Layers`), rendered only when the
selection is all-singles. It needs the selected rows' kinds, so `LedgerControls`
passes an `allSingles` boolean (and the selected single IDs) to the bar. On click:
`router.push('/transactions/lots/new?fromSingles=' + ids.join(','))` and clears the
selection. (`LedgerControls` already owns `selectedIds` and `rows`.)

### New-lot page — `transactions/lots/new/page.tsx`

Accepts `searchParams: { fromSingles?: string }`. When present:
- Parse the comma-separated transaction IDs (cap at, say, 200).
- Fetch those rows: `transactions` where `id in (ids)`, `user_id = me`,
  `kind = 'single_purchase'` (RLS + explicit scope). Validate the fetched set is
  non-empty; silently drop any id that doesn't resolve (deleted / not owned).
- Aggregate `card_id → Σ quantity` → `initialContents`.
- **Majority currency:** count rows per currency, pick the max (first on tie).
- **Suggested total:** `Σ convertCents(|amount_cents|, row.currency, majority,
  row.rate_to_eur, latestRatesFromEur)`; if any conversion returns null, fall back
  to summing only the majority-currency rows (best-effort; the user edits anyway).
- **Date:** earliest `occurred_at` among the singles → `initialPurchasedAt`.
- Pass `initialContents`, `initialCostCents`, `initialCurrency`,
  `initialPurchasedAt`, and `sourceSingleIds` to `LogLotFlow`.

When `fromSingles` is absent the page behaves exactly as today.

### Editor — `LogLotFlow`

New optional prop `sourceSingleIds?: string[]`. When set (create mode only):
- A small banner/eyebrow notes: *"Grouping N purchase(s) — saving replaces them."*
- On submit, call `logCardLot(contents, cost, { consumeSingleIds: sourceSingleIds })`
  instead of the plain create. Everything else (cards grid, tray, price/date popovers)
  is unchanged.

### Server action + RPC

`logCardLot` gains an optional third-arg field `consumeSingleIds?: string[]`. When
present and non-empty, it routes to a new **atomic RPC** rather than the existing
sequential inserts, because consolidation deletes ledger rows and a partial failure
would double-count. The RPC mirrors the project's atomic-write pattern
(`log_psa_submission`):

`group_singles_into_lot(_card_ids text[], _quantities int[], _cost_cents int,
_currency text, _purchased_at timestamptz, _rate_to_eur numeric, _single_ids uuid[])`
returns the new lot id, all in one transaction:
1. Auth guard (`auth.uid()`).
2. Load the consumed singles (`user_id = me`, `kind='single_purchase'`,
   `id = any(_single_ids)`) → `consumed_qty` per card. (Invalid/foreign ids are
   simply absent — no error; the net-delta math still holds.)
3. Insert `card_lots` (cost/currency/rate/purchased_at) → `lot_id`.
4. Insert `lot_contents` from the parallel arrays.
5. Apply net `owned_cards` deltas (`final_lot_qty − consumed_qty` per card, over the
   union of both card sets), delete-to-zero-first.
6. Delete the consumed `single_purchase` transactions.
7. Insert the `lot_purchase` transaction when `_cost_cents` is not null.
8. Return `lot_id`.

After the RPC returns, the action calls `owned_cards_resync_acquired_at` for the
union of affected cards and `revalidatePath('/transactions','/portfolio','/collection')`.
`logCardLot` without `consumeSingleIds` is unchanged.

Validation: Zod adds `consumeSingleIds: z.array(z.string().uuid()).max(200).optional()`.

## Known simplifications (YAGNI)

- Per-single **variant** (holo/reverse) and **note** are not carried into the lot —
  lots track card + quantity only, matching from-scratch lots.
- No undo toast for grouping (unlike bulk-delete). It's a deliberate multi-step
  action ending in an explicit Save; the user can delete the lot to reverse it.
- Sales cannot be folded into a lot (lots are purchases).

## Testing

- **Unit (Vitest):** a pure `majorityCurrency(rows)` helper and a pure
  `suggestedLotTotal(rows, majority, rates)` helper (extracted so the page logic is
  testable): majority pick incl. tie, multi-currency conversion sum, null-rate
  fallback. Reuse `diffLotContents` coverage for the net-delta shape.
- **E2E (Playwright):** extend `bulk-lot.spec.ts` (or a sibling): log two singles of
  different cards (same currency), select both, "Group into bulk lot", verify the
  editor pre-fills 2 cards + summed total, Save → exactly one `lot_purchase` row, the
  two singles gone, owned quantities unchanged, total spent unchanged. A second case
  with two different currencies asserts the majority-currency pre-fill.
