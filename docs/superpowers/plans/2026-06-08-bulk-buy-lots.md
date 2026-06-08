# Bulk Buy ("Card Lots") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user log a bulk buy — an arbitrary set of cards spanning the whole catalogue, with per-card quantities — as one combined purchase transaction, reusing the pack-opening visualisation over every card instead of one set.

**Architecture:** A new `card_lots` / `lot_contents` domain (a pack minus the set, plus a per-card quantity) with a `lot_purchase` ledger kind. Server actions mirror `pack-actions.ts`. The UI is a full-page `LogLotFlow` that fuses the catalogue browser (`CardFiltersToolbar` + a selection-extended `VirtualizedCardGrid`) with the pack flow's picked-tray / price / save mechanics. Launched from the Transactions `ActionsBar`; past lots are ledger rows whose Edit opens the editor.

**Tech Stack:** Next.js 16 (App Router, RSC + Server Actions), Supabase (Postgres + RLS + RPC), TypeScript (strict), Tailwind, `@tanstack/react-virtual`, Vitest (unit), Playwright (e2e). Migrations applied via the Supabase MCP server.

---

## File structure

**Database (new migration files in `supabase/migrations/`, applied via MCP):**
- `20260608120000_card_lots.sql` — `card_lots` + `lot_contents` tables + RLS.
- `20260608120100_transactions_lot_purchase.sql` — `transactions.lot_id` column, FK cascade, partial-unique index, extend `kind` check.
- `20260608120200_owned_cards_apply_deltas.sql` — new parallel-delta RPC.
- `20260608120300_resync_acquired_at_lots.sql` — extend resync to include lot sources.

**App code:**
- Create `app/(dashboard)/_lib/lot-actions.ts` — `logCardLot` / `updateCardLot` / `deleteCardLot` / `syncLotPurchaseTransaction` / `diffLotContents`.
- Create `app/(dashboard)/_lib/card-filters.ts` — shared `applyCardFilters` (extracted from `CardsBrowser`).
- Create `app/(dashboard)/_components/LogLotFlow.tsx` — the full-page flow.
- Create `app/(dashboard)/transactions/lots/new/page.tsx` — create route.
- Create `app/(dashboard)/transactions/lots/[lotId]/edit/page.tsx` — edit route.
- Modify `lib/ledger/aggregates.ts` — add `lot_purchase` kind + `lotId` on `LedgerRow`.
- Modify `app/(dashboard)/_components/CardTile.tsx` — quantity stepper in select mode.
- Modify `app/(dashboard)/cards/_components/VirtualizedCardGrid.tsx` — optional selection props.
- Modify `app/(dashboard)/cards/_components/CardsBrowser.tsx` — use shared `applyCardFilters`.
- Modify `app/(dashboard)/transactions/_components/ActionsBar.tsx` — "Log a bulk lot" link.
- Modify `app/(dashboard)/transactions/page.tsx` — fetch lot card counts, map `lotId`.
- Modify `app/(dashboard)/transactions/_components/LedgerTable.tsx` — label + description + row-actions for `lot_purchase`; `lotCardCount` on row type.
- Modify `app/(dashboard)/transactions/_components/LedgerRowActions.tsx` — `lot_purchase` edit-link case.

**Tests:**
- Create `tests/unit/lot-contents-diff.test.ts` — `diffLotContents` pure logic.
- Modify/extend `tests/unit/aggregates.test.ts` (or create `tests/unit/aggregates-lot.test.ts`) — `lot_purchase` counts as spend.
- Create `tests/e2e/bulk-lot.spec.ts` — log / edit / delete a lot end-to-end.

**Conventions to honour:**
- No `npm run lint` (ESLint config is broken — auto-memory). Type-check with `npm run build`.
- Currency is `'USD' | 'EUR'` everywhere; money is integer cents.
- Every server action calls `requireUserId()` and scopes queries by it.
- After each DB migration, `notify pgrst, 'reload schema';` so PostgREST sees it.

---

## Task 1: Migration — `card_lots` + `lot_contents` tables

**Files:**
- Create: `supabase/migrations/20260608120000_card_lots.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Bulk buy ("card lots"). A lot is a pack without a set: an arbitrary
-- selection of cards from anywhere in the catalogue, bought together for
-- one combined price, with a per-card quantity. Mirrors packs_opened /
-- pack_contents (current card-level schema) minus set_id, plus quantity.

create table if not exists public.card_lots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null,
  purchased_at timestamptz not null default now(),
  cost_cents   integer     check (cost_cents is null or cost_cents >= 0),
  currency     text        check (currency is null or currency in ('USD','EUR')),
  rate_to_eur  numeric(20,10) check (rate_to_eur is null or rate_to_eur > 0),
  created_at   timestamptz not null default now()
);

create table if not exists public.lot_contents (
  lot_id   uuid not null references public.card_lots(id) on delete cascade,
  card_id  text not null,
  quantity integer not null check (quantity > 0),
  primary key (lot_id, card_id)
);

create index if not exists card_lots_user_purchased_at
  on public.card_lots (user_id, purchased_at desc);

alter table public.card_lots  enable row level security;
alter table public.lot_contents enable row level security;

create policy "owner_card_lots" on public.card_lots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner_lot_contents" on public.lot_contents
  for all using (
    exists (
      select 1 from public.card_lots l
      where l.id = lot_contents.lot_id and l.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.card_lots l
      where l.id = lot_contents.lot_id and l.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Supabase MCP**

Call `mcp__supabase__apply_migration` with `name: "card_lots"` and `query` = the file contents above.
Expected: success, no error.

- [ ] **Step 3: Verify tables exist**

Call `mcp__supabase__execute_sql` with:
```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('card_lots','lot_contents')
order by table_name;
```
Expected: two rows — `card_lots`, `lot_contents`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260608120000_card_lots.sql
git commit -m "feat(db): add card_lots and lot_contents tables"
```

---

## Task 2: Migration — `transactions.lot_id` + `lot_purchase` kind

**Files:**
- Create: `supabase/migrations/20260608120100_transactions_lot_purchase.sql`

- [ ] **Step 1: Confirm the current kind-check constraint name**

Call `mcp__supabase__execute_sql` with:
```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.transactions'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%kind%';
```
Expected: one row whose `conname` is `transactions_kind_check`. If the name differs, use that name in Step 2's `drop constraint`.

- [ ] **Step 2: Write the migration file**

```sql
-- Bulk-lot purchases hang off transactions.lot_id, exactly like
-- pack_purchase rows hang off pack_id. One lot_purchase row per lot,
-- amount = -cost_cents. Deleting the lot cascades the ledger row.

alter table public.transactions
  add column lot_id uuid references public.card_lots(id) on delete cascade;

alter table public.transactions
  drop constraint transactions_kind_check;

alter table public.transactions
  add constraint transactions_kind_check check (kind in (
    'pack_purchase','single_purchase','sale','psa_fee','lot_purchase'
  ));

create unique index transactions_lot_purchase_uniq
  on public.transactions (lot_id)
  where kind = 'lot_purchase';

notify pgrst, 'reload schema';
```

- [ ] **Step 3: Apply via Supabase MCP**

Call `mcp__supabase__apply_migration` with `name: "transactions_lot_purchase"` and the query above.
Expected: success.

- [ ] **Step 4: Verify the column + constraint**

Call `mcp__supabase__execute_sql` with:
```sql
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='transactions' and column_name='lot_id') as has_lot_id,
  (select pg_get_constraintdef(oid) from pg_constraint
     where conrelid='public.transactions'::regclass and conname='transactions_kind_check') as kind_def;
```
Expected: `has_lot_id = 1` and `kind_def` contains `lot_purchase`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260608120100_transactions_lot_purchase.sql
git commit -m "feat(db): add lot_id + lot_purchase kind to transactions"
```

---

## Task 3: Migration — `owned_cards_apply_deltas` RPC

**Files:**
- Create: `supabase/migrations/20260608120200_owned_cards_apply_deltas.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Parallel-array sibling of owned_cards_apply_delta. Lots carry a
-- per-card quantity, so logging/editing/deleting a lot needs a *different*
-- delta per card (qty 2->3 = +1, removed = -old, added = +new). The
-- single-delta RPC can't express that. _card_ids[i] gets _deltas[i].
-- Positive deltas upsert (insert or add); negative deltas subtract and
-- delete rows that hit zero. Same security-definer + auth.uid() guard.

create or replace function public.owned_cards_apply_deltas(
  _user_id  uuid,
  _card_ids text[],
  _deltas   int[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _n int := coalesce(array_length(_card_ids, 1), 0);
begin
  if _user_id is null or _user_id <> auth.uid() then
    raise exception 'owned_cards_apply_deltas: not authorized';
  end if;
  if _n = 0 then
    return;
  end if;
  if _n <> coalesce(array_length(_deltas, 1), 0) then
    raise exception 'owned_cards_apply_deltas: card/delta length mismatch';
  end if;

  -- Positive deltas: upsert and add.
  insert into public.owned_cards (user_id, card_id, quantity)
  select _user_id, d.card_id, d.delta
    from unnest(_card_ids, _deltas) as d(card_id, delta)
   where d.delta > 0
  on conflict (user_id, card_id) do update
    set quantity = owned_cards.quantity + excluded.quantity;

  -- Negative deltas: subtract on existing rows.
  update public.owned_cards oc
     set quantity = oc.quantity + d.delta
    from unnest(_card_ids, _deltas) as d(card_id, delta)
   where d.delta < 0
     and oc.user_id = _user_id
     and oc.card_id = d.card_id;

  -- Floor at zero: absence of row = quantity 0.
  delete from public.owned_cards
   where user_id = _user_id
     and card_id = any(_card_ids)
     and quantity <= 0;
end
$$;

revoke all on function public.owned_cards_apply_deltas(uuid, text[], int[]) from public;
grant execute on function public.owned_cards_apply_deltas(uuid, text[], int[]) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Supabase MCP**

Call `mcp__supabase__apply_migration` with `name: "owned_cards_apply_deltas"` and the query above.
Expected: success.

- [ ] **Step 3: Verify the function exists**

Call `mcp__supabase__execute_sql` with:
```sql
select proname from pg_proc where proname = 'owned_cards_apply_deltas';
```
Expected: one row, `owned_cards_apply_deltas`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260608120200_owned_cards_apply_deltas.sql
git commit -m "feat(db): add owned_cards_apply_deltas parallel-delta RPC"
```

---

## Task 4: Migration — extend `owned_cards_resync_acquired_at` for lots

**Files:**
- Create: `supabase/migrations/20260608120300_resync_acquired_at_lots.sql`

- [ ] **Step 1: Write the migration file**

This is `create or replace` of the existing function (from `20260524130000_acquired_at_from_events.sql`), adding lots as a third `least(...)` source. Pack and single-purchase sources are unchanged.

```sql
-- acquired_at is "earliest known event that delivered a copy of this
-- card to this user." Bulk lots are now a third source alongside packs
-- and single purchases. Extends the least(...) with MIN(card_lots.purchased_at).

create or replace function public.owned_cards_resync_acquired_at(
  _user_id uuid,
  _card_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _user_id is null or _user_id <> auth.uid() then
    raise exception 'owned_cards_resync_acquired_at: not authorized';
  end if;
  if array_length(_card_ids, 1) is null then
    return;
  end if;

  update public.owned_cards oc
     set acquired_at = coalesce(
       least(
         (select min(po.opened_at)
            from public.packs_opened po
            join public.pack_contents pc on pc.pack_id = po.id
           where po.user_id = oc.user_id and pc.card_id = oc.card_id),
         (select min(t.occurred_at)
            from public.transactions t
           where t.user_id = oc.user_id
             and t.card_id = oc.card_id
             and t.kind = 'single_purchase'),
         (select min(cl.purchased_at)
            from public.card_lots cl
            join public.lot_contents lc on lc.lot_id = cl.id
           where cl.user_id = oc.user_id and lc.card_id = oc.card_id)
       ),
       oc.acquired_at
     )
   where oc.user_id = _user_id
     and oc.card_id = any(_card_ids);
end
$$;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply via Supabase MCP**

Call `mcp__supabase__apply_migration` with `name: "resync_acquired_at_lots"` and the query above.
Expected: success.

- [ ] **Step 3: Verify the function body references card_lots**

Call `mcp__supabase__execute_sql` with:
```sql
select pg_get_functiondef('public.owned_cards_resync_acquired_at(uuid, text[])'::regprocedure) ilike '%card_lots%' as has_lots;
```
Expected: `has_lots = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260608120300_resync_acquired_at_lots.sql
git commit -m "feat(db): include lots as an acquired_at source"
```

---

## Task 5: Add `lot_purchase` to the ledger kinds (TDD)

**Files:**
- Modify: `lib/ledger/aggregates.ts:12-18` (kinds), `:30` (add `lotId` to `LedgerRow`)
- Test: `tests/unit/aggregates-lot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/aggregates-lot.test.ts
import { describe, expect, it } from "vitest";
import { computeKpis, type LedgerRow } from "@/lib/ledger/aggregates";

const base = {
  occurredAt: "2026-06-01T00:00:00.000Z",
  currency: "EUR" as const,
  rateToEur: 1,
  packId: null,
  cardId: null,
  quantity: null,
  note: null,
  psaSubmissionId: null,
  lotId: null,
};

describe("computeKpis with lot_purchase", () => {
  it("counts a lot_purchase as spend", () => {
    const rows: LedgerRow[] = [
      { ...base, id: "1", kind: "lot_purchase", amountCents: -12000, lotId: "lot-1" },
    ];
    const kpis = computeKpis(rows, "EUR", { EUR: 1, USD: 1.1 });
    expect(kpis.totalSpentCents).toBe(12000);
    expect(kpis.totalEarnedCents).toBe(0);
    expect(kpis.netCashFlowCents).toBe(-12000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/aggregates-lot.test.ts`
Expected: FAIL — TypeScript error that `"lot_purchase"` is not assignable to `TransactionKind` and/or `lotId` not on `LedgerRow`.

- [ ] **Step 3: Add the kind and the field**

In `lib/ledger/aggregates.ts`, change the kinds array:
```ts
export const TRANSACTION_KINDS = [
  "pack_purchase",
  "single_purchase",
  "sale",
  "psa_fee",
  "lot_purchase",
] as const;
```

And add `lotId` to the `LedgerRow` interface (after `packId`):
```ts
  packId: string | null;
  /** Set on lot_purchase rows; links to card_lots.id. */
  lotId: string | null;
  cardId: string | null;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/aggregates-lot.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm no other consumer of `LedgerRow` broke**

Run: `npx tsc --noEmit -p tsconfig.json` (or `npm run build` if tsc isn't standalone).
Expected: any errors are only "Property 'lotId' is missing" at the two places that build `LedgerRow`/`LedgerTableRow` literals — those are fixed in Task 13. Note them; do not fix yet. No errors elsewhere.

- [ ] **Step 6: Commit**

```bash
git add lib/ledger/aggregates.ts tests/unit/aggregates-lot.test.ts
git commit -m "feat(ledger): add lot_purchase kind and lotId to LedgerRow"
```

---

## Task 6: `diffLotContents` pure helper (TDD)

This is the contents-diff math `updateCardLot` relies on, extracted so it's unit-testable in isolation.

**Files:**
- Create: `app/(dashboard)/_lib/lot-actions.ts` (helper + types only in this task)
- Test: `tests/unit/lot-contents-diff.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/lot-contents-diff.test.ts
import { describe, expect, it } from "vitest";
import { diffLotContents } from "@/app/(dashboard)/_lib/lot-actions";

describe("diffLotContents", () => {
  it("treats every next card as an upsert with a positive delta when nothing existed", () => {
    const r = diffLotContents(new Map(), new Map([["a", 2], ["b", 1]]));
    expect(r.upserts).toEqual([{ cardId: "a", quantity: 2 }, { cardId: "b", quantity: 1 }]);
    expect(r.removals).toEqual([]);
    expect(r.deltaCardIds).toEqual(["a", "b"]);
    expect(r.deltas).toEqual([2, 1]);
  });

  it("computes per-card net deltas for quantity changes", () => {
    const r = diffLotContents(new Map([["a", 2], ["b", 3]]), new Map([["a", 3], ["b", 1]]));
    expect(r.upserts).toEqual([{ cardId: "a", quantity: 3 }, { cardId: "b", quantity: 1 }]);
    expect(r.removals).toEqual([]);
    expect(r.deltaCardIds).toEqual(["a", "b"]);
    expect(r.deltas).toEqual([1, -2]);
  });

  it("emits a removal and a negative delta for a dropped card", () => {
    const r = diffLotContents(new Map([["a", 2], ["b", 1]]), new Map([["a", 2]]));
    expect(r.upserts).toEqual([]); // a unchanged, b removed
    expect(r.removals).toEqual(["b"]);
    expect(r.deltaCardIds).toEqual(["b"]);
    expect(r.deltas).toEqual([-1]);
  });

  it("ignores unchanged cards entirely", () => {
    const r = diffLotContents(new Map([["a", 2]]), new Map([["a", 2]]));
    expect(r.upserts).toEqual([]);
    expect(r.removals).toEqual([]);
    expect(r.deltaCardIds).toEqual([]);
    expect(r.deltas).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/lot-contents-diff.test.ts`
Expected: FAIL — cannot find module `lot-actions` / `diffLotContents` not exported.

- [ ] **Step 3: Create `lot-actions.ts` with the helper and shared types**

Create `app/(dashboard)/_lib/lot-actions.ts`. (Server-action functions come in Tasks 7–8; this step adds only the `"use server"` directive, imports, types, and the pure helper. NOTE: a `"use server"` file may only export async functions; `diffLotContents` is sync. So put the helper + types in a sibling non-server module and re-export, OR — simpler — keep `diffLotContents` in its own file. Use a dedicated module:)

Create `app/(dashboard)/_lib/lot-contents.ts`:
```ts
// Pure contents-diff math for card lots, isolated from the server-action
// module so it stays unit-testable (a "use server" file may only export
// async functions).

export interface LotContentRow {
  cardId: string;
  quantity: number;
}

export interface LotContentsDiff {
  /** Cards in `next` whose quantity differs from `existing` (includes new). */
  upserts: LotContentRow[];
  /** Cards present in `existing` but absent from `next`. */
  removals: string[];
  /** Union of changed cards, parallel to `deltas`. */
  deltaCardIds: string[];
  /** Per-card owned-quantity delta: next - existing (existing 0 if new, -existing if removed). */
  deltas: number[];
}

export function diffLotContents(
  existing: ReadonlyMap<string, number>,
  next: ReadonlyMap<string, number>,
): LotContentsDiff {
  const upserts: LotContentRow[] = [];
  const removals: string[] = [];
  const deltaCardIds: string[] = [];
  const deltas: number[] = [];

  for (const [cardId, qty] of next) {
    const prev = existing.get(cardId) ?? 0;
    if (qty !== prev) {
      upserts.push({ cardId, quantity: qty });
      deltaCardIds.push(cardId);
      deltas.push(qty - prev);
    }
  }
  for (const [cardId, prev] of existing) {
    if (!next.has(cardId)) {
      removals.push(cardId);
      deltaCardIds.push(cardId);
      deltas.push(-prev);
    }
  }
  return { upserts, removals, deltaCardIds, deltas };
}
```

Update the test import to `@/app/(dashboard)/_lib/lot-contents` instead of `lot-actions`:
```ts
import { diffLotContents } from "@/app/(dashboard)/_lib/lot-contents";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/lot-contents-diff.test.ts`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/_lib/lot-contents.ts" tests/unit/lot-contents-diff.test.ts
git commit -m "feat(lots): add diffLotContents pure helper"
```

---

## Task 7: `logCardLot` server action + transaction sync

**Files:**
- Create: `app/(dashboard)/_lib/lot-actions.ts`

- [ ] **Step 1: Write `lot-actions.ts` with `logCardLot` and `syncLotPurchaseTransaction`**

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isCurrency, type Currency } from "@/lib/pricing/currencies";
import { getRateToEurToday } from "@/lib/pricing/exchange-rates";
import { requireUserId } from "./current-user";
import { diffLotContents, type LotContentRow } from "./lot-contents";

// Matches the pack-cost guard in pack-actions.ts: $1,000,000 in cents.
const MAX_COST_CENTS = 1_000_000_00;
const MAX_CARDS = 2048;

const costSchema = z
  .object({
    costCents: z.number().int().min(0).max(MAX_COST_CENTS).nullable(),
    currency: z.string().refine(isCurrency, "unsupported currency"),
  })
  .optional();

export interface LotCostInput {
  costCents: number | null;
  currency: Currency;
}

const contentSchema = z.object({
  cardId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(99),
});

const logLotSchema = z.object({
  contents: z.array(contentSchema).max(MAX_CARDS),
  cost: costSchema,
});

// Replaces the lot's lot_purchase ledger row with one reflecting the
// lot's current cost/currency/purchased_at/rate. Idempotent — no row
// when cost is null. deleteCardLot relies on the transactions.lot_id FK
// cascade, so no explicit delete is needed there.
async function syncLotPurchaseTransaction(
  supabase: SupabaseClient,
  userId: string,
  lotId: string,
): Promise<void> {
  const { data: lot, error: lookupErr } = await supabase
    .from("card_lots")
    .select("cost_cents, currency, purchased_at, rate_to_eur")
    .eq("id", lotId)
    .eq("user_id", userId)
    .single();
  if (lookupErr) throw new Error(lookupErr.message);

  const { error: delErr } = await supabase
    .from("transactions")
    .delete()
    .eq("lot_id", lotId)
    .eq("kind", "lot_purchase")
    .eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);

  if (lot.cost_cents == null || !lot.currency) return;

  const { error: insErr } = await supabase.from("transactions").insert({
    user_id: userId,
    kind: "lot_purchase",
    occurred_at: lot.purchased_at,
    amount_cents: -lot.cost_cents,
    currency: lot.currency,
    lot_id: lotId,
    rate_to_eur: lot.rate_to_eur ?? null,
  });
  if (insErr) throw new Error(insErr.message);
}

export async function logCardLot(
  contents: LotContentRow[],
  cost?: LotCostInput,
): Promise<{ lotId: string; newCards: number }> {
  const { contents: rows, cost: parsedCost } = logLotSchema.parse({ contents, cost });

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

  const lotRow: {
    user_id: string;
    cost_cents?: number | null;
    currency?: string | null;
    rate_to_eur?: number | null;
  } = { user_id: userId };
  if (parsedCost) {
    lotRow.cost_cents = parsedCost.costCents;
    lotRow.currency = parsedCost.costCents != null ? parsedCost.currency : null;
    if (parsedCost.costCents != null) {
      lotRow.rate_to_eur = await getRateToEurToday(parsedCost.currency);
    }
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

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: compiles past `lot-actions.ts` (build may still fail later at the Task 13 wiring sites — that's fine; confirm no error originates in `lot-actions.ts`).

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/_lib/lot-actions.ts"
git commit -m "feat(lots): add logCardLot server action"
```

---

## Task 8: `updateCardLot` + `deleteCardLot` server actions

**Files:**
- Modify: `app/(dashboard)/_lib/lot-actions.ts` (append)

- [ ] **Step 1: Append the update + delete actions**

Add these imports to the top if not present: `diffLotContents` is already imported. Append:

```ts
const updateLotSchema = z.object({
  lotId: z.string().uuid(),
  contents: z.array(contentSchema).max(MAX_CARDS),
  purchasedAt: z.string().datetime().optional(),
  cost: costSchema,
});

export interface UpdateLotOptions {
  purchasedAt?: string;
  costCents?: number | null;
  currency?: Currency;
}

export async function updateCardLot(
  lotId: string,
  contents: LotContentRow[],
  options: UpdateLotOptions = {},
): Promise<{ newCards: number }> {
  const cost =
    options.currency !== undefined
      ? { costCents: options.costCents ?? null, currency: options.currency }
      : undefined;
  const {
    lotId: lid,
    contents: rows,
    purchasedAt: when,
    cost: parsedCost,
  } = updateLotSchema.parse({ lotId, contents, purchasedAt: options.purchasedAt, cost });

  const nextByCard = new Map<string, number>();
  for (const r of rows) nextByCard.set(r.cardId, r.quantity);

  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: lot, error: lookupErr } = await supabase
    .from("card_lots")
    .select("id, currency")
    .eq("id", lid)
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupErr) throw new Error(lookupErr.message);
  if (!lot) throw new Error("Lot not found");

  const lotPatch: {
    purchased_at?: string;
    cost_cents?: number | null;
    currency?: string | null;
    rate_to_eur?: number | null;
  } = {};
  if (when) lotPatch.purchased_at = when;
  if (parsedCost) {
    lotPatch.cost_cents = parsedCost.costCents;
    lotPatch.currency = parsedCost.costCents != null ? parsedCost.currency : null;
    const currencyChanged =
      parsedCost.costCents != null && lot.currency !== parsedCost.currency;
    if (parsedCost.costCents == null) {
      lotPatch.rate_to_eur = null;
    } else if (currencyChanged) {
      lotPatch.rate_to_eur = await getRateToEurToday(parsedCost.currency);
    }
  }
  if (Object.keys(lotPatch).length > 0) {
    const { error: patchErr } = await supabase
      .from("card_lots")
      .update(lotPatch)
      .eq("id", lid)
      .eq("user_id", userId);
    if (patchErr) throw new Error(patchErr.message);
  }

  const { data: existingContents } = await supabase
    .from("lot_contents")
    .select("card_id, quantity")
    .eq("lot_id", lid);
  const existingByCard = new Map<string, number>(
    (existingContents ?? []).map((r) => [r.card_id as string, r.quantity as number]),
  );

  const diff = diffLotContents(existingByCard, nextByCard);

  // Write contents: upsert changed rows, delete removed rows.
  if (diff.upserts.length > 0) {
    const upsertRows = diff.upserts.map((u) => ({
      lot_id: lid,
      card_id: u.cardId,
      quantity: u.quantity,
    }));
    const { error: upErr } = await supabase
      .from("lot_contents")
      .upsert(upsertRows, { onConflict: "lot_id,card_id" });
    if (upErr) throw new Error(upErr.message);
  }
  if (diff.removals.length > 0) {
    const { error: delErr } = await supabase
      .from("lot_contents")
      .delete()
      .eq("lot_id", lid)
      .in("card_id", diff.removals);
    if (delErr) throw new Error(delErr.message);
  }

  // newCards = cards being added that the user doesn't already own.
  let newCards = 0;
  const addedCardIds = diff.deltaCardIds.filter((c, i) => diff.deltas[i]! > 0 && !existingByCard.has(c));
  if (addedCardIds.length > 0) {
    const { data: existingOwned } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", userId)
      .in("card_id", addedCardIds);
    const alreadyOwned = new Set((existingOwned ?? []).map((r) => r.card_id as string));
    newCards = addedCardIds.filter((c) => !alreadyOwned.has(c)).length;
  }

  // Apply owned deltas.
  if (diff.deltaCardIds.length > 0) {
    const { error: deltaErr } = await supabase.rpc("owned_cards_apply_deltas", {
      _user_id: userId,
      _card_ids: diff.deltaCardIds,
      _deltas: diff.deltas,
    });
    if (deltaErr) throw new Error(deltaErr.message);
  }

  // Resync acquired_at for the union of touched cards (date or membership
  // may have shifted). Always-on union; the RPC no-ops untouched cards.
  if (when || diff.deltaCardIds.length > 0) {
    const resyncIds = [...new Set([...existingByCard.keys(), ...nextByCard.keys()])];
    if (resyncIds.length > 0) {
      const { error: resyncErr } = await supabase.rpc("owned_cards_resync_acquired_at", {
        _user_id: userId,
        _card_ids: resyncIds,
      });
      if (resyncErr) throw new Error(`Failed to resync acquired_at: ${resyncErr.message}`);
    }
  }

  if (parsedCost || when) {
    await syncLotPurchaseTransaction(supabase, userId, lid);
  }

  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
  return { newCards };
}

export async function deleteCardLot(lotId: string): Promise<void> {
  const lid = z.string().uuid().parse(lotId);
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: contents } = await supabase
    .from("lot_contents")
    .select("card_id, quantity, card_lots!inner(user_id)")
    .eq("lot_id", lid)
    .eq("card_lots.user_id", userId);
  const cardIds = (contents ?? []).map((r) => r.card_id as string);
  const deltas = (contents ?? []).map((r) => -(r.quantity as number));

  if (cardIds.length > 0) {
    const { error: deltaErr } = await supabase.rpc("owned_cards_apply_deltas", {
      _user_id: userId,
      _card_ids: cardIds,
      _deltas: deltas,
    });
    if (deltaErr) throw new Error(`Failed to decrement owned: ${deltaErr.message}`);
  }

  const { error } = await supabase
    .from("card_lots")
    .delete()
    .eq("user_id", userId)
    .eq("id", lid);
  if (error) throw new Error(`Failed to delete lot: ${error.message}`);

  if (cardIds.length > 0) {
    const { error: resyncErr } = await supabase.rpc("owned_cards_resync_acquired_at", {
      _user_id: userId,
      _card_ids: cardIds,
    });
    if (resyncErr) throw new Error(`Failed to resync acquired_at: ${resyncErr.message}`);
  }
  // The lot_purchase ledger row (if any) cascades via transactions.lot_id.
  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: `lot-actions.ts` compiles (remaining errors, if any, are only at the Task 13 wiring sites).

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/_lib/lot-actions.ts"
git commit -m "feat(lots): add updateCardLot and deleteCardLot actions"
```

---

## Task 9: Extract shared `applyCardFilters`

**Files:**
- Create: `app/(dashboard)/_lib/card-filters.ts`
- Modify: `app/(dashboard)/cards/_components/CardsBrowser.tsx:19-62` (remove local `applyFilters`, import shared)

- [ ] **Step 1: Create the shared module**

Move the `applyFilters` body from `CardsBrowser.tsx` verbatim into a new file, renamed `applyCardFilters`:

```ts
// app/(dashboard)/_lib/card-filters.ts
// Shared catalogue filter — used by the Cards browser and the bulk-lot
// flow so both filter ~20k cards identically.
import type { CardEntry } from "@/lib/data/types";
import type { CardsFilterState } from "../_components/CardFiltersToolbar";

export function applyCardFilters(
  cards: CardEntry[],
  f: CardsFilterState,
  searchDebounced: string,
): CardEntry[] {
  const q = searchDebounced.trim().toLowerCase();
  const hasSetIds = f.setIds.size > 0;
  const hasRarities = f.rarities.size > 0;
  const hasTypes = f.types.size > 0;
  const hasDex = f.dexFrom !== null || f.dexTo !== null;
  const lo = f.dexFrom ?? 1;
  const hi = f.dexTo ?? 1025;
  const dexLo = Math.min(lo, hi);
  const dexHi = Math.max(lo, hi);

  return cards.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    if (f.supertype !== "all" && c.supertype !== f.supertype) return false;
    if (hasSetIds && !f.setIds.has(c.setId)) return false;
    if (hasRarities && !f.rarities.has(c.rarity)) return false;
    if (hasTypes) {
      let hit = false;
      for (const t of c.types) {
        if (f.types.has(t)) { hit = true; break; }
      }
      if (!hit) return false;
    }
    if (f.artist && c.artist !== f.artist) return false;
    if (hasDex) {
      let hit = false;
      for (const d of c.dex) {
        if (d >= dexLo && d <= dexHi) { hit = true; break; }
      }
      if (!hit) return false;
    }
    return true;
  });
}
```

- [ ] **Step 2: Update `CardsBrowser.tsx` to use it**

In `app/(dashboard)/cards/_components/CardsBrowser.tsx`: delete the local `applyFilters` function (lines ~19-62) and its now-unused imports if any; add `import { applyCardFilters } from "../../_lib/card-filters";`; change the `useMemo` body from `applyFilters(cards, filters, searchDebounced)` to `applyCardFilters(cards, filters, searchDebounced)`.

- [ ] **Step 3: Type-check + run existing card tests**

Run: `npm run build`
Expected: compiles (CardsBrowser unchanged in behaviour).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/_lib/card-filters.ts" "app/(dashboard)/cards/_components/CardsBrowser.tsx"
git commit -m "refactor(cards): extract shared applyCardFilters"
```

---

## Task 10: Quantity stepper in `CardTile` select mode

**Files:**
- Modify: `app/(dashboard)/_components/CardTile.tsx:21-30` (props), `:81-110` (select-mode button overlay)

- [ ] **Step 1: Add quantity props to the `Props` interface**

In `CardTile.tsx`, extend `Props` (after `onSelect`):
```ts
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: (cardId: string) => void;
  /** When provided alongside selectMode, the tile shows a quantity badge
   *  with +/- steppers instead of a plain check. `selected` still gates
   *  the ring. Used by the bulk-lot flow. */
  selectedQuantity?: number;
  onQuantityChange?: (cardId: string, quantity: number) => void;
  hideActions?: boolean;
```

- [ ] **Step 2: Destructure the new props**

In `TileBase({ ... })`, add `selectedQuantity` and `onQuantityChange` to the destructured params (next to `onSelect`).

- [ ] **Step 3: Render the quantity overlay in select mode**

Replace the `selected && (...)` check-badge block inside the `selectMode` `<button>` with a conditional: when `onQuantityChange` is provided and `selectedQuantity` is set, render a stepper; otherwise keep the existing check. Because the stepper has its own buttons, render it as a sibling overlay (not inside the toggle button) to avoid nested buttons. Concretely, change the select-mode branch to:

```tsx
        {selectMode ? (
          <div className="relative" style={{ aspectRatio: "245 / 342" }}>
            <button
              type="button"
              onClick={() =>
                onQuantityChange
                  ? onQuantityChange(card.id, selected ? 0 : 1)
                  : onSelect?.(card.id)
              }
              className={imageClassName + " absolute inset-0"}
              aria-label={`Toggle ${card.name}`}
              tabIndex={0}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.imageSmall}
                alt={card.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
            {selected && !onQuantityChange && (
              <span className="pointer-events-none absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-bg">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
              </span>
            )}
            {selected && onQuantityChange && (
              <div className="absolute top-1 right-1 inline-flex h-7 items-stretch overflow-hidden rounded-md border border-accent bg-accent text-bg shadow">
                <button
                  type="button"
                  onClick={() => onQuantityChange(card.id, Math.max(0, (selectedQuantity ?? 1) - 1))}
                  className="inline-flex w-6 items-center justify-center transition hover:bg-accent/80"
                  aria-label={`Decrease ${card.name} quantity`}
                >
                  <Minus className="h-3 w-3" strokeWidth={3} aria-hidden />
                </button>
                <span className="inline-flex min-w-7 items-center justify-center border-x border-bg/30 px-1.5 text-[11px] font-semibold tabular-nums" aria-hidden>
                  ×{selectedQuantity ?? 1}
                </span>
                <button
                  type="button"
                  onClick={() => onQuantityChange(card.id, Math.min(99, (selectedQuantity ?? 1) + 1))}
                  className="inline-flex w-6 items-center justify-center transition hover:bg-accent/80"
                  aria-label={`Increase ${card.name} quantity`}
                >
                  <Plus className="h-3 w-3" strokeWidth={3} aria-hidden />
                </button>
              </div>
            )}
          </div>
        ) : (
```

(`Minus`, `Plus`, `Check` are already imported in `CardTile.tsx`.)

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: compiles. The `/packs` pack flow (which passes `selectMode`+`onSelect` only, no `onQuantityChange`) renders the check badge exactly as before.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/_components/CardTile.tsx"
git commit -m "feat(cards): add quantity stepper to CardTile select mode"
```

---

## Task 11: Selection props on `VirtualizedCardGrid`

**Files:**
- Modify: `app/(dashboard)/cards/_components/VirtualizedCardGrid.tsx:17-20` (props), `:134-136` (tile render)

- [ ] **Step 1: Extend `Props`**

```ts
interface Props {
  cards: CardEntry[];
  cols: number;
  /** When provided, tiles render in select mode with a quantity stepper.
   *  Absent => read-only (the /cards catalogue). */
  selected?: ReadonlyMap<string, number>;
  onQuantityChange?: (cardId: string, quantity: number) => void;
}
```

- [ ] **Step 2: Thread props into the tile render**

Change the signature line to `export function VirtualizedCardGrid({ cards, cols, selected, onQuantityChange }: Props) {` and replace the `<CardTile ... />` line (inside the row `.map`) with:

```tsx
              {rowCards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  density="grid"
                  selectMode={selected != null}
                  selected={selected != null && (selected.get(card.id) ?? 0) > 0}
                  selectedQuantity={selected?.get(card.id) ?? 0}
                  onQuantityChange={onQuantityChange}
                />
              ))}
```

(When `selected` is undefined, `selectMode` is false and the tile is read-only exactly as today.)

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: compiles; `/cards` behaviour unchanged.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/cards/_components/VirtualizedCardGrid.tsx"
git commit -m "feat(cards): optional selection/quantity props on VirtualizedCardGrid"
```

---

## Task 12: `LogLotFlow` component

This is the centrepiece. It reuses `CardFiltersToolbar`, `applyCardFilters`, `sortCards`, the extended `VirtualizedCardGrid`, and adapts the pack flow's `PricePaidField` + sticky footer + dirty guard. Reuse `PricePaidField` and the date popover by importing them — but they are not exported from `LogPackFlow.tsx`. To avoid a large refactor, this task includes copying `PricePaidField` and a `PurchasedAtField` (generalised `OpenedAtField`) into the new file. (A later cleanup could extract them to a shared module; out of scope here.)

**Files:**
- Create: `app/(dashboard)/_components/LogLotFlow.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Layers, X } from "lucide-react";
import type { CardEntry } from "@/lib/data/types";
import {
  formatMoneyCents,
  type LedgerCurrency,
} from "@/lib/ledger/money";
import { applyCardFilters } from "../_lib/card-filters";
import { deleteCardLot, logCardLot, updateCardLot } from "../_lib/lot-actions";
import { sortCards, type CardSort } from "../_lib/card-sort";
import { VirtualizedCardGrid } from "../cards/_components/VirtualizedCardGrid";
import {
  CardFiltersToolbar,
  emptyFilters,
  type CardsFilterState,
} from "./CardFiltersToolbar";

interface Props {
  cards: CardEntry[];
  artists: string[];
  types: string[];
  defaultCurrency: LedgerCurrency;
  // Edit mode:
  editingLotId?: string;
  initialContents?: { cardId: string; quantity: number }[];
  initialPurchasedAt?: string;
  initialCostCents?: number | null;
  initialCurrency?: LedgerCurrency | null;
}

function toLocalInput(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

const SIZE_KEY = "cardgrid.size.lot-flow";

export function LogLotFlow({
  cards,
  artists,
  types,
  defaultCurrency,
  editingLotId,
  initialContents,
  initialPurchasedAt,
  initialCostCents,
  initialCurrency,
}: Props) {
  const router = useRouter();
  const editing = Boolean(editingLotId);

  const [picked, setPicked] = useState<Map<string, number>>(
    () => new Map((initialContents ?? []).map((c) => [c.cardId, c.quantity])),
  );
  const [costCents, setCostCents] = useState<number | null>(initialCostCents ?? null);
  const [currency, setCurrency] = useState<LedgerCurrency>(initialCurrency ?? defaultCurrency);
  const [purchasedAtLocal, setPurchasedAtLocal] = useState<string>(() =>
    toLocalInput(initialPurchasedAt),
  );

  const [filters, setFilters] = useState<CardsFilterState>(() => emptyFilters());
  const [sort, setSort] = useState<CardSort>("number");
  const [cols, setCols] = useState(5);
  const [searchDebounced, setSearchDebounced] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(filters.search), 150);
    return () => clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    const raw = window.localStorage.getItem(SIZE_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) setCols(Math.max(2, Math.min(10, n)));
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem(SIZE_KEY, String(cols));
  }, [cols]);

  const filtered = useMemo(
    () => applyCardFilters(cards, filters, searchDebounced),
    [cards, filters, searchDebounced],
  );
  const sorted = useMemo(() => sortCards(filtered, sort), [filtered, sort]);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const initialMap = useMemo(
    () => new Map((initialContents ?? []).map((c) => [c.cardId, c.quantity])),
    [initialContents],
  );

  const distinct = picked.size;
  let copies = 0;
  for (const q of picked.values()) copies += q;

  const dirty = useMemo(() => {
    if (!editing) return picked.size > 0 || costCents != null;
    if (picked.size !== initialMap.size) return true;
    for (const [id, q] of picked) if (initialMap.get(id) !== q) return true;
    if (purchasedAtLocal !== toLocalInput(initialPurchasedAt)) return true;
    const baseCost = initialCostCents ?? null;
    const baseCurrency = initialCurrency ?? defaultCurrency;
    return costCents !== baseCost || currency !== baseCurrency;
  }, [editing, picked, initialMap, purchasedAtLocal, initialPurchasedAt, costCents, currency, initialCostCents, initialCurrency, defaultCurrency]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const setQuantity = (cardId: string, quantity: number) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (quantity <= 0) next.delete(cardId);
      else next.set(cardId, quantity);
      return next;
    });
  };

  const submit = () => {
    setError(null);
    const contents = [...picked.entries()].map(([cardId, quantity]) => ({ cardId, quantity }));
    start(async () => {
      try {
        if (editingLotId) {
          await updateCardLot(editingLotId, contents, {
            purchasedAt: fromLocalInput(purchasedAtLocal),
            costCents,
            currency,
          });
          router.push(`/transactions?lotEdited=${editingLotId}`);
        } else {
          const { lotId } = await logCardLot(contents, { costCents, currency });
          router.push(`/transactions?lotLogged=${lotId}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const performEmpty = () => {
    if (!editingLotId) return;
    setError(null);
    start(async () => {
      try {
        await deleteCardLot(editingLotId);
        router.push(`/transactions?lotDeleted=${editingLotId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-panel-2 text-accent">
            <Layers className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="eyebrow">{editing ? "Editing bulk lot" : "Logging a bulk lot"}</p>
            <p className="text-base font-semibold">Pick cards from anywhere</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PricePaidField
            costCents={costCents}
            currency={currency}
            onCostChange={setCostCents}
            onCurrencyChange={setCurrency}
          />
          <PurchasedAtField value={purchasedAtLocal} onChange={setPurchasedAtLocal} />
          <Link
            href="/transactions"
            onClick={(e) => {
              if (dirty && !window.confirm("Discard this bulk lot?")) e.preventDefault();
            }}
            className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
          >
            Exit
          </Link>
        </div>
      </div>

      <PickedTray picked={picked} cardsById={cardsById} onRemove={(id) => setQuantity(id, 0)} onSetQty={setQuantity} />

      <CardFiltersToolbar
        filters={filters}
        onFiltersChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        cols={cols}
        onColsChange={setCols}
        resultCount={sorted.length}
        totalCount={cards.length}
        artists={artists}
        types={types}
      />

      <VirtualizedCardGrid cards={sorted} cols={cols} selected={picked} onQuantityChange={setQuantity} />

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-panel/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <p className="text-sm text-muted">
          {distinct === 0 ? (
            "Click cards to add them to this lot."
          ) : (
            <>
              <span className="nums font-semibold text-text">{distinct}</span> card
              {distinct === 1 ? "" : "s"} ·{" "}
              <span className="nums font-semibold text-text">{copies}</span> cop
              {copies === 1 ? "y" : "ies"}
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {confirmingEmpty ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmingEmpty(false)}
                className="rounded-md border border-border bg-panel-2 px-3 py-2 text-xs text-muted transition hover:text-text"
              >
                Keep lot
              </button>
              <button
                type="button"
                onClick={performEmpty}
                disabled={pending}
                className="rounded-md border border-missing/70 bg-missing/15 px-4 py-2 text-sm font-semibold text-missing transition hover:bg-missing/25 disabled:opacity-50"
              >
                {pending ? "Removing…" : "Yes, delete lot"}
              </button>
            </>
          ) : editing && picked.size === 0 ? (
            <button
              type="button"
              onClick={() => setConfirmingEmpty(true)}
              className="rounded-md border border-missing/60 bg-transparent px-4 py-2 text-sm font-semibold text-missing transition hover:bg-missing/15"
            >
              Delete this lot
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={pending || (!editing && picked.size === 0) || (editing && !dirty)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Saving…" : editing ? "Save changes" : `Save lot (${copies})`}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-missing">{error}</p>}
    </div>
  );
}

function PickedTray({
  picked,
  cardsById,
  onRemove,
  onSetQty,
}: {
  picked: Map<string, number>;
  cardsById: Map<string, CardEntry>;
  onRemove: (cardId: string) => void;
  onSetQty: (cardId: string, qty: number) => void;
}) {
  const items = useMemo(
    () =>
      [...picked.entries()]
        .map(([id, qty]) => ({ card: cardsById.get(id), qty }))
        .filter((x): x is { card: CardEntry; qty: number } => x.card != null)
        .sort((a, b) => a.card.name.localeCompare(b.card.name)),
    [picked, cardsById],
  );
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-accent/40 bg-accent/5 p-3">
      {items.map(({ card, qty }) => (
        <div
          key={card.id}
          className="group flex items-center gap-1.5 rounded-md bg-panel-2 px-2 py-1 text-xs"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.imageSmall} alt="" className="h-8 w-6 rounded-sm object-cover" loading="lazy" />
          <span className="max-w-[120px] truncate">{card.name}</span>
          <span className="inline-flex items-center rounded bg-panel-3 tabular-nums">
            <button type="button" onClick={() => onSetQty(card.id, qty - 1)} className="px-1.5 text-muted hover:text-text" aria-label={`Decrease ${card.name}`}>−</button>
            <span className="px-1 text-text">×{qty}</span>
            <button type="button" onClick={() => onSetQty(card.id, Math.min(99, qty + 1))} className="px-1.5 text-muted hover:text-text" aria-label={`Increase ${card.name}`}>+</button>
          </span>
          <button type="button" onClick={() => onRemove(card.id)} aria-label={`Remove ${card.name}`}>
            <X className="h-3 w-3 text-muted transition-colors group-hover:text-missing" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Copy `PricePaidField` and add `PurchasedAtField`**

Append `PricePaidField` (copied verbatim from `LogPackFlow.tsx:559-702`, but WITHOUT the `dirty` prop and its border-color branch — drop the `dirty` param and use the plain border) and a `PurchasedAtField` (copied from `OpenedAtField` `LogPackFlow.tsx:453-557` with the label text "Purchased" instead of "Opened" and the dialog heading "When did you buy it?", and WITHOUT the `dirty` prop). They need: `useCallback, useEffect, useRef, useState` (add to the React import), `CalendarClock, ChevronDown, Tag` from lucide-react (add to the import), `isLedgerCurrency, parseMoneyCents` from `@/lib/ledger/money` (add to that import), and `SUPPORTED_CURRENCIES` from `@/lib/pricing/currencies`. The helper functions `splitLocalInput`, `joinLocalInput`, `formatOpenedAt` (rename to `formatPurchasedAt`) must also be copied from `LogPackFlow.tsx:52-75`.

Reference the exact `PricePaidField`/`OpenedAtField` source in `app/(dashboard)/_components/LogPackFlow.tsx` and reproduce them here, deleting every `dirty` reference (the field is always interactive; dirty styling isn't needed for the lot flow).

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: compiles. If `VirtualizedCardGrid`'s `useScrollArea` requires the page to be inside the dashboard `ScrollAreaContext`, that's satisfied because the route lives under `(dashboard)`.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/_components/LogLotFlow.tsx"
git commit -m "feat(lots): add LogLotFlow full-catalogue selection component"
```

---

## Task 13: Routes for create + edit

**Files:**
- Create: `app/(dashboard)/transactions/lots/new/page.tsx`
- Create: `app/(dashboard)/transactions/lots/[lotId]/edit/page.tsx`

- [ ] **Step 1: Create the "new" page**

```tsx
// app/(dashboard)/transactions/lots/new/page.tsx
import { Layers } from "lucide-react";
import { getAllCards, distinctArtists } from "@/lib/data/binder-scope";
import { PageHeader } from "../../../_components/PageHeader";
import { LogLotFlow } from "../../../_components/LogLotFlow";
import { requireUserId } from "../../../_lib/current-user";
import { loadUserPreferences } from "../../../_lib/user-preferences";

export default async function NewLotPage() {
  const userId = await requireUserId();
  const prefs = await loadUserPreferences(userId);
  const cards = await getAllCards();
  const artists = distinctArtists(cards);
  const typeSet = new Set<string>();
  for (const c of cards) for (const t of c.types) typeSet.add(t);
  const types = [...typeSet].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <PageHeader icon={Layers} title="Log a bulk lot" />
      <LogLotFlow cards={cards} artists={artists} types={types} defaultCurrency={prefs.displayCurrency} />
    </div>
  );
}
```

- [ ] **Step 2: Create the "edit" page**

```tsx
// app/(dashboard)/transactions/lots/[lotId]/edit/page.tsx
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getAllCards, distinctArtists } from "@/lib/data/binder-scope";
import { isLedgerCurrency } from "@/lib/ledger/money";
import { requireUserId } from "../../../../_lib/current-user";
import { loadUserPreferences } from "../../../../_lib/user-preferences";
import { LogLotFlow } from "../../../../_components/LogLotFlow";

interface PageProps {
  params: Promise<{ lotId: string }>;
}

export default async function EditLotPage({ params }: PageProps) {
  const { lotId } = await params;
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: lot, error } = await supabase
    .from("card_lots")
    .select("id, purchased_at, cost_cents, currency")
    .eq("id", lotId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lot) notFound();

  const { data: contents, error: contentsErr } = await supabase
    .from("lot_contents")
    .select("card_id, quantity")
    .eq("lot_id", lot.id);
  if (contentsErr) throw new Error(contentsErr.message);

  const prefs = await loadUserPreferences(userId);
  const cards = await getAllCards();
  const artists = distinctArtists(cards);
  const typeSet = new Set<string>();
  for (const c of cards) for (const t of c.types) typeSet.add(t);
  const types = [...typeSet].sort((a, b) => a.localeCompare(b));

  const rawCurrency = lot.currency as string | null;
  const initialCurrency = isLedgerCurrency(rawCurrency) ? rawCurrency : null;

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <LogLotFlow
        cards={cards}
        artists={artists}
        types={types}
        defaultCurrency={prefs.displayCurrency}
        editingLotId={lot.id as string}
        initialContents={(contents ?? []).map((r) => ({
          cardId: r.card_id as string,
          quantity: r.quantity as number,
        }))}
        initialPurchasedAt={lot.purchased_at as string}
        initialCostCents={(lot.cost_cents as number | null) ?? null}
        initialCurrency={initialCurrency}
      />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: compiles (relative import depths: `new` page is 3 levels under `(dashboard)` so `../../../`; `edit` page is 4 levels so `../../../../`).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/transactions/lots/new/page.tsx" "app/(dashboard)/transactions/lots/[lotId]/edit/page.tsx"
git commit -m "feat(lots): add create + edit routes"
```

---

## Task 14: "Log a bulk lot" button in `ActionsBar`

**Files:**
- Modify: `app/(dashboard)/transactions/_components/ActionsBar.tsx`

- [ ] **Step 1: Add a Link to the new route**

Add `import Link from "next/link";` and `Layers` to the lucide import. After the "New PSA submission" button, inside the toolbar `div`, add:

```tsx
        <Link
          href="/transactions/lots/new"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-panel-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Log a bulk lot
        </Link>
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/transactions/_components/ActionsBar.tsx"
git commit -m "feat(lots): add Log a bulk lot action to Transactions"
```

---

## Task 15: Wire `lot_purchase` rows into the ledger table

**Files:**
- Modify: `app/(dashboard)/transactions/page.tsx` (select `lot_id`; build `lotCardCount`; set `lotId`/`lotCardCount` on rows)
- Modify: `app/(dashboard)/transactions/_components/LedgerTable.tsx` (`LedgerTableRow.lotCardCount`; `KIND_LABEL.lot_purchase`; `RowActions` + `renderDescription` lot branches)
- Modify: `app/(dashboard)/transactions/_components/LedgerRowActions.tsx` (`lot_purchase` case)

- [ ] **Step 1: `transactions/page.tsx` — select `lot_id` and fetch lot card counts**

In the `transactions` select string, add `lot_id` to the column list (alongside `pack_id`). Add a parallel query in the `Promise.all` (mirroring `psaCardsRes`) to count cards per lot:

```ts
    supabase
      .from("lot_contents")
      .select("lot_id, card_lots!inner(user_id)")
      .eq("card_lots.user_id", userId),
```
Bind it to `lotContentsRes` in the destructure. After the `psaCardCountById` loop, add:

```ts
  const lotCardCountById = new Map<string, number>();
  for (const r of lotContentsRes.data ?? []) {
    const lid = (r as { lot_id: string }).lot_id;
    lotCardCountById.set(lid, (lotCardCountById.get(lid) ?? 0) + 1);
  }
```

Add `lot_id: string | null;` to the `rawRows` cast type. In the `tableRows.push({...})` literal add:
```ts
      lotId: r.lot_id,
      lotCardCount: r.lot_id ? lotCardCountById.get(r.lot_id) ?? 0 : null,
```

- [ ] **Step 2: `LedgerTable.tsx` — type, label, row-actions, description**

Add to `LedgerTableRow`:
```ts
  lotCardCount: number | null;
```
Add to `KIND_LABEL`:
```ts
  lot_purchase: "Bulk lot",
```
In `RowActions`, add before the final `return null;`:
```tsx
  if (row.kind === "lot_purchase" && row.lotId) {
    return <LedgerRowActions kind="lot_purchase" lotId={row.lotId} />;
  }
```
In `renderDescription`, add before the `if (row.note)` fallback:
```tsx
  if (row.kind === "lot_purchase" && row.lotId) {
    const n = row.lotCardCount ?? 0;
    return (
      <Link
        href={`/transactions/lots/${row.lotId}/edit`}
        className="text-text underline-offset-2 hover:underline"
      >
        Bulk lot
        {n > 0 && (
          <span className="ml-1 text-[11px] text-muted tabular-nums">
            · {n} card{n === 1 ? "" : "s"}
          </span>
        )}
      </Link>
    );
  }
```

- [ ] **Step 3: `LedgerRowActions.tsx` — add the `lot_purchase` case**

Add a member to the `Props` union:
```ts
  | {
      kind: "lot_purchase";
      lotId: string;
    }
```
Add a branch (after the `pack_purchase` branch), mirroring it:
```tsx
  if (props.kind === "lot_purchase") {
    return (
      <Tooltip content="Edit lot">
        <Link
          href={`/transactions/lots/${props.lotId}/edit`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-panel-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Edit lot"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </Tooltip>
    );
  }
```

- [ ] **Step 4: Type-check (this should clear the Task 5 deferred errors)**

Run: `npm run build`
Expected: PASS — all `LedgerRow`/`LedgerTableRow` literals now include `lotId`/`lotCardCount`. If `tsc` flags a missing `lotId` on the `LedgerRow` built in `page.tsx`, ensure Step 1 added it.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/transactions/page.tsx" "app/(dashboard)/transactions/_components/LedgerTable.tsx" "app/(dashboard)/transactions/_components/LedgerRowActions.tsx"
git commit -m "feat(lots): show lot_purchase rows in the ledger with edit links"
```

---

## Task 16: E2E happy path (Playwright)

**Files:**
- Create: `tests/e2e/bulk-lot.spec.ts`

Use the project's OTP-cookie auth helper (per project memory: admin magic links don't set SSR cookies; the working specs authenticate via OTP verify + injected `@supabase/ssr` cookies). Inspect an existing spec under `tests/e2e/` for the exact `signIn` helper and reuse it; do not hand-roll auth.

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/bulk-lot.spec.ts
import { test, expect } from "@playwright/test";
// Reuse the project's working auth helper — match the import the other
// passing specs use (e.g. `import { signIn } from "./helpers/auth";`).
// Adjust the import path/name to the actual helper in this repo.
import { signIn } from "./helpers/auth";

test("log, edit, and delete a bulk lot", async ({ page }) => {
  await signIn(page);

  // Start a bulk lot from Transactions.
  await page.goto("/transactions");
  await page.getByRole("link", { name: "Log a bulk lot" }).click();
  await expect(page).toHaveURL(/\/transactions\/lots\/new/);

  // Search and add two cards via the grid stepper.
  const search = page.getByPlaceholder(/search/i).first();
  await search.fill("Charizard");
  // Click the first result tile to add qty 1.
  const firstTile = page.locator("[data-card-id]").first();
  await firstTile.click();
  // Bump it to qty 2 via the in-tile increase control.
  await page.getByRole("button", { name: /Increase .* quantity/ }).first().click();

  // Add a price.
  await page.getByRole("button", { name: /Add price/ }).click();
  await page.getByLabel("Price paid").fill("40.00");
  await page.getByRole("button", { name: "Done" }).click();

  // Save.
  await page.getByRole("button", { name: /Save lot/ }).click();
  await expect(page).toHaveURL(/\/transactions/);

  // The ledger shows a "Bulk lot" row.
  await expect(page.getByText(/Bulk lot/).first()).toBeVisible();

  // Edit it: open via the row's description link.
  await page.getByRole("link", { name: /Bulk lot/ }).first().click();
  await expect(page).toHaveURL(/\/transactions\/lots\/.*\/edit/);

  // Delete it: clear selection then delete.
  // (Remove all picked cards from the tray, then "Delete this lot".)
  // The tray remove buttons are labelled "Remove <name>".
  for (const btn of await page.getByRole("button", { name: /^Remove / }).all()) {
    await btn.click();
  }
  await page.getByRole("button", { name: "Delete this lot" }).click();
  await page.getByRole("button", { name: "Yes, delete lot" }).click();
  await expect(page).toHaveURL(/\/transactions/);
});
```

- [ ] **Step 2: Adjust selectors to reality**

Run: `npx playwright test tests/e2e/bulk-lot.spec.ts --reporter=line`
Expected: it may fail first run on selector text. Fix selectors to match the rendered DOM (button labels from Tasks 12/14), re-run until green. Confirm: the lot appears, the cards become owned, and the row reads "Bulk lot · N cards".

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/bulk-lot.spec.ts
git commit -m "test(lots): e2e for log/edit/delete bulk lot"
```

---

## Task 17: Full verification

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: PASS, except the known pre-existing `coverage.test.ts` `meAdded` failure (per project memory). The new `aggregates-lot` and `lot-contents-diff` tests pass.

- [ ] **Step 2: Production build (type-check)**

Run: `npm run build`
Expected: success, no type errors.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run: `npm run dev`, sign in with `npx tsx scripts/dev/magic-link.ts <email>`, go to Transactions → Log a bulk lot, add a few cards with quantities across sets, set a price, save. Confirm: one "Bulk lot · N cards" ledger row, total-spent increased, the cards are owned with the right quantities in Collection, and editing/deleting behaves.

- [ ] **Step 4: Final commit (if smoke fixes anything)**

```bash
git add -A
git commit -m "chore(lots): verification fixes"
```

---

## Self-review notes (author)

- **Spec coverage:** tables (T1), ledger kind + lot_id (T2, T5), apply_deltas (T3), resync (T4), actions log/update/delete + sync (T6–T8), per-card quantities (T10–T12), full-catalogue browse via shared filters + virtualized grid (T9, T11, T12), Transactions entry + ledger rows + edit routes (T13–T15), tests (T6, T5, T16). All spec sections map to a task.
- **Type consistency:** `LotContentRow {cardId, quantity}` is used uniformly by `diffLotContents`, `logCardLot`, `updateCardLot`, and `LogLotFlow`. `owned_cards_apply_deltas(_user_id, _card_ids, _deltas)` arg names match every call site. `LedgerRow.lotId` + `LedgerTableRow.lotCardCount` are defined (T5/T15) before use (T15). `LedgerRowActions` `lot_purchase` member matches the `RowActions` call.
- **Known non-blockers:** `npm run lint` is broken (use build); `coverage.test.ts meAdded` fails pre-existing. Both per project memory.
- **Deferred build errors:** Task 5 intentionally leaves `LedgerRow` literal sites incomplete until Task 15 fills `lotId`/`lotCardCount`; Task 15 Step 4 is where the build returns fully green.
