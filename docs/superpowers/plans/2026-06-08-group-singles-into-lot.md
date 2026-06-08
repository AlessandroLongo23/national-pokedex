# Group Singles Into a Bulk Lot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user select `single_purchase` rows in the Transactions ledger and consolidate them into one bulk lot — replacing the singles with a single `lot_purchase`, preserving spend and ownership, via a pre-filled bulk-lot editor.

**Architecture:** A "Group into bulk lot" action on the ledger selection bar navigates to the bulk-lot editor with `?fromSingles=<ids>`. The new-lot server page fetches those singles, aggregates card→quantity, picks the majority currency, sums a suggested total, and pre-fills `LogLotFlow`. Saving routes `logCardLot` to a new atomic RPC `group_singles_into_lot` that creates the lot, deletes the singles, and adjusts `owned_cards` by the net (usually zero) delta — all in one transaction.

**Tech Stack:** Next.js 16 (RSC + Server Actions), Supabase (Postgres RPC + RLS), TypeScript (strict), Vitest, Playwright. Migrations via the Supabase MCP server.

---

## File structure

- Create `app/(dashboard)/_lib/group-singles.ts` — pure helpers `majorityCurrency`, `suggestedLotTotalCents`.
- Create `supabase/migrations/20260608130000_group_singles_into_lot.sql` — the atomic RPC.
- Modify `app/(dashboard)/_lib/lot-actions.ts` — `logCardLot` gains `options.purchasedAt` + `options.consumeSingleIds` (routes to the RPC when consuming).
- Modify `app/(dashboard)/_components/LogLotFlow.tsx` — `sourceSingleIds` prop, banner, submit passes purchasedAt + consumeSingleIds.
- Modify `app/(dashboard)/transactions/lots/new/page.tsx` — read `?fromSingles`, build initial state.
- Modify `app/(dashboard)/transactions/_components/LedgerSelectionBar.tsx` — "Group into bulk lot" button.
- Modify `app/(dashboard)/transactions/_components/LedgerControls.tsx` — `canGroup` + nav.
- Test: `tests/unit/group-singles.test.ts`, extend `tests/e2e/bulk-lot.spec.ts` (new spec `tests/e2e/group-singles.spec.ts`).

**Conventions:** No `npm run lint` (broken — use `npm run build` to type-check). Currency is `'USD'|'EUR'`. Every action calls `requireUserId()` and scopes by it. `notify pgrst, 'reload schema';` after migrations.

---

## Task 1: Pure helpers `majorityCurrency` + `suggestedLotTotalCents` (TDD)

**Files:**
- Create: `app/(dashboard)/_lib/group-singles.ts`
- Test: `tests/unit/group-singles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/group-singles.test.ts
import { describe, expect, it } from "vitest";
import { majorityCurrency, suggestedLotTotalCents } from "@/app/(dashboard)/_lib/group-singles";
import type { Currency } from "@/lib/pricing/currencies";

const RATES = { EUR: 1, USD: 1.1 } as unknown as Record<Currency, number>;

describe("majorityCurrency", () => {
  it("returns the most common currency", () => {
    expect(majorityCurrency(["USD", "EUR", "USD"])).toBe("USD");
  });
  it("returns the first seen on a tie", () => {
    expect(majorityCurrency(["EUR", "USD"])).toBe("EUR");
  });
  it("returns null for an empty list", () => {
    expect(majorityCurrency([])).toBeNull();
  });
});

describe("suggestedLotTotalCents", () => {
  it("sums exactly when all rows share the target currency", () => {
    const rows = [
      { amountCents: -736, currency: "EUR" as Currency, rateToEur: 1 },
      { amountCents: -40, currency: "EUR" as Currency, rateToEur: 1 },
    ];
    expect(suggestedLotTotalCents(rows, "EUR", RATES)).toBe(776);
  });
  it("converts other-currency rows into the target via snapshot rate", () => {
    // 100 USD cents at rate_to_eur 0.5 -> 50 EUR cents; + 200 EUR cents = 250.
    const rows = [
      { amountCents: -100, currency: "USD" as Currency, rateToEur: 0.5 },
      { amountCents: -200, currency: "EUR" as Currency, rateToEur: 1 },
    ];
    expect(suggestedLotTotalCents(rows, "EUR", RATES)).toBe(250);
  });
  it("skips rows whose conversion is impossible (best-effort)", () => {
    const rows = [
      { amountCents: -500, currency: "EUR" as Currency, rateToEur: 1 },
      { amountCents: -999, currency: "GBP" as Currency, rateToEur: null }, // no rate, not in RATES
    ];
    expect(suggestedLotTotalCents(rows, "EUR", RATES)).toBe(500);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/group-singles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

```ts
// app/(dashboard)/_lib/group-singles.ts
import type { Currency } from "@/lib/pricing/currencies";
import { convertCents } from "@/lib/pricing/exchange-rates";

/** Most frequent currency in the list; first-seen wins a tie; null if empty. */
export function majorityCurrency(currencies: Currency[]): Currency | null {
  const counts = new Map<Currency, number>();
  let best: Currency | null = null;
  let bestN = 0;
  for (const c of currencies) {
    const n = (counts.get(c) ?? 0) + 1;
    counts.set(c, n);
    // Strict `>` keeps the FIRST currency to reach a given count on ties.
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  return best;
}

export interface SingleAmount {
  /** Signed cents from the ledger (purchases are negative). */
  amountCents: number;
  currency: Currency;
  rateToEur: number | null;
}

/** Sum of |amount| converted into `target`, skipping rows that can't convert. */
export function suggestedLotTotalCents(
  rows: SingleAmount[],
  target: Currency,
  latestRatesFromEur: Record<Currency, number>,
): number {
  let total = 0;
  for (const r of rows) {
    const converted = convertCents(
      Math.abs(r.amountCents),
      r.currency,
      target,
      r.rateToEur,
      latestRatesFromEur,
    );
    if (converted != null) total += converted;
  }
  return total;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/group-singles.test.ts`
Expected: PASS (6 assertions across 6 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/_lib/group-singles.ts" tests/unit/group-singles.test.ts
git commit -m "feat(lots): majorityCurrency + suggestedLotTotalCents helpers"
```

---

## Task 2: Migration — `group_singles_into_lot` atomic RPC

**Files:**
- Create: `supabase/migrations/20260608130000_group_singles_into_lot.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Consolidate N single_purchase transactions into one bulk lot, atomically.
-- Creates the lot + contents + lot_purchase row, deletes the consumed
-- singles, and adjusts owned_cards by the NET delta per card
-- (final_lot_qty - sum(consumed_single_qty)). For a pure group the net is
-- zero, so ownership and spend are unchanged — only the representation.
-- Reuses owned_cards_apply_deltas (delete-to-zero-first) and
-- owned_cards_resync_acquired_at, both security-definer with their own
-- auth.uid() guard which passes because _user_id = auth.uid() here too.

create or replace function public.group_singles_into_lot(
  _card_ids      text[],
  _quantities    int[],
  _cost_cents    int,
  _currency      text,
  _purchased_at  timestamptz,
  _rate_to_eur   numeric,
  _single_ids    uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _lot_id  uuid;
  _n int := coalesce(array_length(_card_ids, 1), 0);
  _pa timestamptz := coalesce(_purchased_at, now());
  _delta_cards text[];
  _delta_vals  int[];
  _union_cards text[];
begin
  if _user_id is null then
    raise exception 'group_singles_into_lot: not authenticated';
  end if;
  if _n = 0 or _n <> coalesce(array_length(_quantities, 1), 0) then
    raise exception 'group_singles_into_lot: invalid contents';
  end if;
  if _cost_cents is not null and (_currency is null or _currency not in ('USD','EUR')) then
    raise exception 'group_singles_into_lot: invalid currency %', _currency;
  end if;

  insert into public.card_lots (user_id, purchased_at, cost_cents, currency, rate_to_eur)
  values (
    _user_id, _pa,
    _cost_cents,
    case when _cost_cents is null then null else _currency end,
    case when _cost_cents is null then null else _rate_to_eur end
  )
  returning id into _lot_id;

  insert into public.lot_contents (lot_id, card_id, quantity)
    select _lot_id, card_id, qty
      from unnest(_card_ids, _quantities) as f(card_id, qty);

  -- Net owned delta per card over the union of final-lot and consumed-single cards.
  with consumed as (
    select t.card_id, sum(t.quantity)::int as qty
      from public.transactions t
     where t.user_id = _user_id
       and t.kind = 'single_purchase'
       and t.id = any(_single_ids)
     group by t.card_id
  ),
  final as (
    select card_id, qty from unnest(_card_ids, _quantities) as f(card_id, qty)
  ),
  deltas as (
    select coalesce(f.card_id, c.card_id) as card_id,
           coalesce(f.qty, 0) - coalesce(c.qty, 0) as delta
      from final f
      full outer join consumed c on c.card_id = f.card_id
  )
  select
    array_agg(card_id) filter (where delta <> 0),
    array_agg(delta)   filter (where delta <> 0),
    array_agg(distinct card_id)
  into _delta_cards, _delta_vals, _union_cards
  from deltas;

  if _delta_cards is not null and array_length(_delta_cards, 1) > 0 then
    perform public.owned_cards_apply_deltas(_user_id, _delta_cards, _delta_vals);
  end if;

  delete from public.transactions
   where user_id = _user_id
     and kind = 'single_purchase'
     and id = any(_single_ids);

  if _cost_cents is not null then
    insert into public.transactions
      (user_id, kind, occurred_at, amount_cents, currency, lot_id, rate_to_eur)
    values
      (_user_id, 'lot_purchase', _pa, -_cost_cents, _currency, _lot_id, _rate_to_eur);
  end if;

  if _union_cards is not null and array_length(_union_cards, 1) > 0 then
    perform public.owned_cards_resync_acquired_at(_user_id, _union_cards);
  end if;

  return _lot_id;
end
$$;

revoke all on function public.group_singles_into_lot(text[], int[], int, text, timestamptz, numeric, uuid[]) from public;
grant execute on function public.group_singles_into_lot(text[], int[], int, text, timestamptz, numeric, uuid[]) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Supabase MCP**

Call `mcp__supabase__apply_migration` with `name: "group_singles_into_lot"` and the query above.
Expected: success.

- [ ] **Step 3: Verify the function exists**

Call `mcp__supabase__execute_sql`:
```sql
select proname from pg_proc where proname = 'group_singles_into_lot';
```
Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260608130000_group_singles_into_lot.sql
git commit -m "feat(db): add group_singles_into_lot atomic RPC"
```

---

## Task 3: Extend `logCardLot` — `purchasedAt` + `consumeSingleIds`

**Files:**
- Modify: `app/(dashboard)/_lib/lot-actions.ts`

- [ ] **Step 1: Add the options to the schema + type**

Replace the `logLotSchema` definition and the `logCardLot` signature/body. First, update the schema (just after the existing `logLotSchema`):

```ts
const logLotSchema = z.object({
  contents: z.array(contentSchema).max(MAX_CARDS),
  cost: costSchema,
  purchasedAt: z.string().datetime().optional(),
  consumeSingleIds: z.array(z.string().uuid()).max(200).optional(),
});

export interface LogCardLotOptions {
  purchasedAt?: string;
  consumeSingleIds?: string[];
}
```

- [ ] **Step 2: Rewrite `logCardLot` to accept options and route grouping to the RPC**

Replace the whole `export async function logCardLot(...)` with:

```ts
export async function logCardLot(
  contents: LotContentRow[],
  cost?: LotCostInput,
  options: LogCardLotOptions = {},
): Promise<{ lotId: string; newCards: number }> {
  const {
    contents: rows,
    cost: parsedCost,
    purchasedAt,
    consumeSingleIds,
  } = logLotSchema.parse({
    contents,
    cost,
    purchasedAt: options.purchasedAt,
    consumeSingleIds: options.consumeSingleIds,
  });

  // Dedupe by card_id, keeping the last quantity supplied.
  const byCard = new Map<string, number>();
  for (const r of rows) byCard.set(r.cardId, r.quantity);
  const cardIds = [...byCard.keys()];

  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  // Snapshot ownership before writes so newCards = cards going 0 -> >=1.
  let newCards = 0;
  if (cardIds.length > 0) {
    const { data: existingOwned } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", userId)
      .in("card_id", cardIds);
    const alreadyOwned = new Set((existingOwned ?? []).map((r) => r.card_id as string));
    newCards = cardIds.filter((c) => !alreadyOwned.has(c)).length;
  }

  const rateToEur =
    parsedCost && parsedCost.costCents != null
      ? await getRateToEurToday(parsedCost.currency)
      : null;

  // Grouping path: consolidate existing singles into the lot atomically.
  if (consumeSingleIds && consumeSingleIds.length > 0) {
    const { data: lotId, error } = await supabase.rpc("group_singles_into_lot", {
      _card_ids: cardIds,
      _quantities: cardIds.map((c) => byCard.get(c)!),
      _cost_cents: parsedCost ? parsedCost.costCents : null,
      _currency: parsedCost && parsedCost.costCents != null ? parsedCost.currency : null,
      _purchased_at: purchasedAt ?? null,
      _rate_to_eur: rateToEur,
      _single_ids: consumeSingleIds,
    });
    if (error) throw new Error(`Failed to group into lot: ${error.message}`);
    revalidatePath("/transactions");
    revalidatePath("/portfolio");
    revalidatePath("/collection");
    return { lotId: lotId as string, newCards };
  }

  const lotRow: {
    user_id: string;
    purchased_at?: string;
    cost_cents?: number | null;
    currency?: string | null;
    rate_to_eur?: number | null;
  } = { user_id: userId };
  if (purchasedAt) lotRow.purchased_at = purchasedAt;
  if (parsedCost) {
    lotRow.cost_cents = parsedCost.costCents;
    lotRow.currency = parsedCost.costCents != null ? parsedCost.currency : null;
    if (parsedCost.costCents != null) lotRow.rate_to_eur = rateToEur;
  }

  const { data: lot, error: lotErr } = await supabase
    .from("card_lots")
    .insert(lotRow)
    .select("id")
    .single();
  if (lotErr) throw new Error(`Failed to log lot: ${lotErr.message}`);

  if (cardIds.length > 0) {
    const contentRows = cardIds.map((card_id) => ({
      lot_id: lot.id,
      card_id,
      quantity: byCard.get(card_id)!,
    }));
    const { error: contentsErr } = await supabase.from("lot_contents").insert(contentRows);
    if (contentsErr) throw new Error(`Failed to write lot contents: ${contentsErr.message}`);

    const deltas = cardIds.map((c) => byCard.get(c)!);
    const { error: deltaErr } = await supabase.rpc("owned_cards_apply_deltas", {
      _user_id: userId,
      _card_ids: cardIds,
      _deltas: deltas,
    });
    if (deltaErr) throw new Error(`Failed to mark owned: ${deltaErr.message}`);

    const { error: resyncErr } = await supabase.rpc("owned_cards_resync_acquired_at", {
      _user_id: userId,
      _card_ids: cardIds,
    });
    if (resyncErr) throw new Error(`Failed to resync acquired_at: ${resyncErr.message}`);
  }

  if (parsedCost && parsedCost.costCents != null) {
    await syncLotPurchaseTransaction(supabase, userId, lot.id as string);
  }

  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
  return { lotId: lot.id as string, newCards };
}
```

(Note: the non-grouping path now also honours `purchasedAt`, fixing a latent gap where the create editor's date field was ignored.)

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: `lot-actions.ts` compiles. Callers of `logCardLot` still pass `(contents, cost)` — the third arg is optional. The LogLotFlow caller is updated in Task 4.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/_lib/lot-actions.ts"
git commit -m "feat(lots): logCardLot accepts purchasedAt + consumeSingleIds (grouping)"
```

---

## Task 4: `LogLotFlow` — grouping awareness

**Files:**
- Modify: `app/(dashboard)/_components/LogLotFlow.tsx`

- [ ] **Step 1: Add the `sourceSingleIds` prop**

In the `Props` interface, after `initialCurrency`:

```ts
  initialCurrency?: LedgerCurrency | null;
  // When set, this create-mode flow is consolidating existing single
  // purchases; saving creates the lot AND deletes these single txn rows.
  sourceSingleIds?: string[];
```

Add `sourceSingleIds` to the destructured params in the function signature (after `initialCurrency`).

- [ ] **Step 2: Pass purchasedAt + consumeSingleIds on submit**

In `submit()`, replace the create branch (`else { const { lotId } = await logCardLot(contents, { costCents, currency }); ... }`) with:

```ts
        } else {
          const { lotId } = await logCardLot(
            contents,
            { costCents, currency },
            {
              purchasedAt: fromLocalInput(purchasedAtLocal),
              consumeSingleIds: sourceSingleIds,
            },
          );
          router.push(`/transactions?lotLogged=${lotId}`);
        }
```

- [ ] **Step 3: Add a banner when grouping**

Immediately after the opening `<div className="space-y-4">` (before the context-bar `div`), add:

```tsx
      {sourceSingleIds && sourceSingleIds.length > 0 && (
        <p className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-2 text-xs text-muted">
          Grouping <span className="font-semibold text-text">{sourceSingleIds.length}</span>{" "}
          single purchase{sourceSingleIds.length === 1 ? "" : "s"} — saving replaces
          {sourceSingleIds.length === 1 ? " it" : " them"} with this bulk lot.
        </p>
      )}
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/_components/LogLotFlow.tsx"
git commit -m "feat(lots): LogLotFlow consolidates source singles on save"
```

---

## Task 5: New-lot page reads `?fromSingles`

**Files:**
- Modify: `app/(dashboard)/transactions/lots/new/page.tsx`

- [ ] **Step 1: Rewrite the page to build grouping state**

```tsx
import { Layers } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getAllCards, distinctArtists } from "@/lib/data/binder-scope";
import { getLatestRatesFromEur } from "@/lib/pricing/exchange-rates";
import { isLedgerCurrency, type LedgerCurrency } from "@/lib/ledger/money";
import { PageHeader } from "../../../_components/PageHeader";
import { LogLotFlow } from "../../../_components/LogLotFlow";
import { requireUserId } from "../../../_lib/current-user";
import { loadUserPreferences } from "../../../_lib/user-preferences";
import {
  majorityCurrency,
  suggestedLotTotalCents,
  type SingleAmount,
} from "../../../_lib/group-singles";

interface PageProps {
  searchParams: Promise<{ fromSingles?: string }>;
}

export default async function NewLotPage({ searchParams }: PageProps) {
  const { fromSingles } = await searchParams;
  const userId = await requireUserId();
  const prefs = await loadUserPreferences(userId);
  const cards = await getAllCards();
  const artists = distinctArtists(cards);
  const typeSet = new Set<string>();
  for (const c of cards) for (const t of c.types) typeSet.add(t);
  const types = [...typeSet].sort((a, b) => a.localeCompare(b));

  let initialContents: { cardId: string; quantity: number }[] | undefined;
  let initialCostCents: number | null | undefined;
  let initialCurrency: LedgerCurrency | null | undefined;
  let initialPurchasedAt: string | undefined;
  let sourceSingleIds: string[] | undefined;

  const ids = (fromSingles ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);

  if (ids.length > 0) {
    const supabase = await getSupabaseServer();
    const { data: singles } = await supabase
      .from("transactions")
      .select("id, card_id, quantity, amount_cents, currency, rate_to_eur, occurred_at")
      .eq("user_id", userId)
      .eq("kind", "single_purchase")
      .in("id", ids);

    const rows = (singles ?? []) as Array<{
      id: string;
      card_id: string;
      quantity: number;
      amount_cents: number;
      currency: string;
      rate_to_eur: number | string | null;
      occurred_at: string;
    }>;

    if (rows.length > 0) {
      // Aggregate card -> total quantity.
      const byCard = new Map<string, number>();
      for (const r of rows) byCard.set(r.card_id, (byCard.get(r.card_id) ?? 0) + r.quantity);
      initialContents = [...byCard.entries()].map(([cardId, quantity]) => ({ cardId, quantity }));

      const ledgerRows = rows.filter((r) => isLedgerCurrency(r.currency));
      const majority =
        majorityCurrency(ledgerRows.map((r) => r.currency as LedgerCurrency)) ??
        prefs.displayCurrency;
      const latestRatesFromEur = await getLatestRatesFromEur();
      const amounts: SingleAmount[] = ledgerRows.map((r) => ({
        amountCents: r.amount_cents,
        currency: r.currency as LedgerCurrency,
        rateToEur: r.rate_to_eur == null ? null : Number(r.rate_to_eur),
      }));
      initialCostCents = suggestedLotTotalCents(amounts, majority, latestRatesFromEur);
      initialCurrency = majority;

      // Earliest purchase date among the singles.
      initialPurchasedAt = rows
        .map((r) => r.occurred_at)
        .reduce((a, b) => (a < b ? a : b));

      sourceSingleIds = rows.map((r) => r.id);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <PageHeader icon={Layers} title="Log a bulk lot" />
      <LogLotFlow
        cards={cards}
        artists={artists}
        types={types}
        defaultCurrency={prefs.displayCurrency}
        initialContents={initialContents}
        initialCostCents={initialCostCents}
        initialCurrency={initialCurrency}
        initialPurchasedAt={initialPurchasedAt}
        sourceSingleIds={sourceSingleIds}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: compiles. With no `?fromSingles`, all `initial*` are undefined and the flow behaves exactly as before.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/transactions/lots/new/page.tsx"
git commit -m "feat(lots): new-lot page pre-fills from selected singles"
```

---

## Task 6: Selection-bar "Group into bulk lot" action

**Files:**
- Modify: `app/(dashboard)/transactions/_components/LedgerSelectionBar.tsx`
- Modify: `app/(dashboard)/transactions/_components/LedgerControls.tsx`

- [ ] **Step 1: Add the button to `LedgerSelectionBar`**

Replace the component with:

```tsx
"use client";

import { Layers, Trash2 } from "lucide-react";

interface Props {
  selectedCount: number;
  canGroup: boolean;
  onGroup: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function LedgerSelectionBar({
  selectedCount,
  canGroup,
  onGroup,
  onDelete,
  onClear,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel-2 px-3 py-2">
      <span className="text-sm font-medium text-text tabular-nums">
        {selectedCount} selected
      </span>
      <div className="flex items-center gap-1">
        {canGroup && (
          <button
            type="button"
            onClick={onGroup}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
            Group into bulk lot
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-md border border-missing/30 bg-missing/10 px-2.5 py-1 text-xs font-medium text-missing transition hover:bg-missing/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missing"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire `canGroup` + `handleGroup` in `LedgerControls`**

Add `import { useRouter } from "next/navigation";` to the imports. Inside `LedgerControls`, after `const timerRef = ...`, add:

```ts
  const router = useRouter();
```

Before the `return (`, add the grouping derivation + handler:

```ts
  const selectedSingleIds = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      if (selectedIds.has(r.id) && r.kind === "single_purchase") out.push(r.id);
    }
    return out;
  }, [rows, selectedIds]);

  // Group only when EVERY selected row is a single purchase.
  const canGroup =
    selectedIds.size > 0 && selectedSingleIds.length === selectedIds.size;

  const handleGroup = () => {
    if (selectedSingleIds.length === 0) return;
    setSelectedIds(new Set());
    router.push(`/transactions/lots/new?fromSingles=${selectedSingleIds.join(",")}`);
  };
```

Update the `<LedgerSelectionBar ... />` usage to pass the new props:

```tsx
        <LedgerSelectionBar
          selectedCount={selectedIds.size}
          canGroup={canGroup}
          onGroup={handleGroup}
          onDelete={handleDelete}
          onClear={handleClear}
        />
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/transactions/_components/LedgerSelectionBar.tsx" "app/(dashboard)/transactions/_components/LedgerControls.tsx"
git commit -m "feat(lots): Group into bulk lot action on the ledger selection bar"
```

---

## Task 7: E2E — group two singles into a lot

**Files:**
- Create: `tests/e2e/group-singles.spec.ts`

Reuse the OTP-cookie `signIn(context)` helper from `tests/e2e/bulk-lot.spec.ts` (copy it; the repo inlines auth per-spec). Seed two single_purchase rows directly via the admin client (calling the `log_single_purchase` RPC requires the user's JWT, so instead insert via the admin client into `transactions` + `owned_cards`, OR — simpler and more faithful — drive the UI's "Log a singles purchase" modal twice). To keep the test fast and deterministic, seed via SQL using the service-role client.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/group-singles.spec.ts
import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "group-singles-e2e@example.com";

test.use({ viewport: { width: 1280, height: 900 } });

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}
async function getUserId(): Promise<string | null> {
  const { data } = await admin().auth.admin.listUsers();
  return data.users.find((u) => u.email === TEST_EMAIL)?.id ?? null;
}
async function signIn(context: BrowserContext) {
  const { data: link, error: le } = await admin().auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (le) throw le;
  const otp = link.properties!.email_otp!;
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: verified, error: ve } = await anon.auth.verifyOtp({
    email: TEST_EMAIL,
    token: otp,
    type: "email",
  });
  if (ve) throw ve;
  const session = verified.session!;
  const captured: { name: string; value: string }[] = [];
  const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (items) => {
        for (const it of items) captured.push({ name: it.name, value: it.value });
      },
    },
  });
  await ssr.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  await context.addCookies(
    captured.map((c) => ({
      name: c.name,
      value: c.value,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
  );
}

const CARD_A = "sv1-1";
const CARD_B = "sv1-2";

async function reset(userId: string) {
  await admin().from("card_lots").delete().eq("user_id", userId);
  await admin().from("transactions").delete().eq("user_id", userId);
  await admin().from("owned_cards").delete().eq("user_id", userId);
}

// Seed two EUR single_purchase rows + matching owned_cards (qty 1 each).
async function seedSingles(userId: string) {
  await admin().from("transactions").insert([
    { user_id: userId, kind: "single_purchase", card_id: CARD_A, quantity: 1, amount_cents: -500, currency: "EUR", rate_to_eur: 1, occurred_at: "2026-06-01T10:00:00.000Z" },
    { user_id: userId, kind: "single_purchase", card_id: CARD_B, quantity: 1, amount_cents: -300, currency: "EUR", rate_to_eur: 1, occurred_at: "2026-06-02T10:00:00.000Z" },
  ]);
  await admin().from("owned_cards").insert([
    { user_id: userId, card_id: CARD_A, quantity: 1, acquired_at: "2026-06-01T10:00:00.000Z" },
    { user_id: userId, card_id: CARD_B, quantity: 1, acquired_at: "2026-06-02T10:00:00.000Z" },
  ]);
}

test("group two singles into a bulk lot", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(context);
  const userId = await getUserId();
  expect(userId).not.toBeNull();
  await reset(userId!);
  await seedSingles(userId!);

  await page.goto("/transactions");
  // Select the two single rows (their checkboxes), then group.
  const checkboxes = page.getByRole("checkbox", { name: "Select transaction" });
  await expect(checkboxes.first()).toBeVisible({ timeout: 20_000 });
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) await checkboxes.nth(i).check();

  await page.getByRole("button", { name: "Group into bulk lot" }).click();
  await expect(page).toHaveURL(/\/transactions\/lots\/new\?fromSingles=/);

  // Editor pre-filled: two cards in the tray, total 8.00 EUR suggested.
  await expect(page.getByText(/Grouping 2 single purchases/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Paid €8.00")).toBeVisible();

  await page.getByRole("button", { name: /Save lot/ }).click();
  await expect(page).toHaveURL(/lotLogged=/);

  // Exactly one lot, two content rows, the singles are gone, ownership unchanged.
  const { data: lots } = await admin().from("card_lots").select("id, cost_cents").eq("user_id", userId!);
  expect(lots?.length).toBe(1);
  expect(lots?.[0]?.cost_cents).toBe(800);
  const { data: contents } = await admin().from("lot_contents").select("card_id, quantity").eq("lot_id", lots![0]!.id);
  expect(contents?.length).toBe(2);
  const { data: singlesAfter } = await admin().from("transactions").select("id").eq("user_id", userId!).eq("kind", "single_purchase");
  expect(singlesAfter?.length).toBe(0);
  const { data: lotTxn } = await admin().from("transactions").select("amount_cents").eq("user_id", userId!).eq("kind", "lot_purchase");
  expect(lotTxn?.length).toBe(1);
  expect(lotTxn?.[0]?.amount_cents).toBe(-800);
  const { data: owned } = await admin().from("owned_cards").select("card_id, quantity").eq("user_id", userId!);
  expect(owned?.length).toBe(2);
  for (const o of owned ?? []) expect(o.quantity).toBe(1);

  await reset(userId!);
});
```

- [ ] **Step 2: Run + fix selectors**

Run: `set -a && . ./.env && set +a && npx playwright test tests/e2e/group-singles.spec.ts --reporter=line`
Expected: may need selector tweaks (checkbox aria-label is "Select transaction" per LedgerTable; the money format from `formatMoneyCents` may render "€8.00"). Adjust until green: confirm one lot of 800¢, no singles, owned unchanged.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/group-singles.spec.ts
git commit -m "test(lots): e2e for grouping singles into a bulk lot"
```

---

## Task 8: Full verification

- [ ] **Step 1: Unit suite**

Run: `npm test`
Expected: PASS except the known pre-existing `coverage.test.ts > meAdded`. New `group-singles` tests pass.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: success, no type errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "chore(lots): grouping verification fixes"
```

---

## Self-review notes (author)

- **Spec coverage:** entry button (T6), pre-filled new-lot page incl. majority currency + suggested total (T1, T5), editor consolidation on save (T3, T4), atomic RPC with net-delta ownership (T2), e2e (T7). All spec sections map to a task.
- **Type consistency:** `logCardLot(contents, cost?, options?)` with `LogCardLotOptions { purchasedAt?, consumeSingleIds? }` used identically in T3 (def), T4 (caller). `sourceSingleIds: string[]` prop in T4 matches the page in T5. `majorityCurrency`/`suggestedLotTotalCents`/`SingleAmount` defined T1, used T5. RPC arg names match the `supabase.rpc("group_singles_into_lot", {...})` call in T3.
- **Net-delta correctness:** for a pure group, `final_lot_qty == Σ consumed_single_qty` per card so every delta is 0 → ownership untouched; the RPC still deletes the singles and writes the lot. Verified by the e2e's ownership assertions.
- **Known non-blockers:** `npm run lint` broken (use build); `coverage.test.ts meAdded` pre-existing.
