"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatMoneyCents, type LedgerCurrency } from "@/lib/ledger/money";
import type { LedgerRow, TransactionKind } from "@/lib/ledger/aggregates";
import type { Currency } from "@/lib/pricing/currencies";
import { convertCents } from "@/lib/pricing/exchange-rates";
import { MoneyDisplay } from "../../_components/MoneyDisplay";
import type { CardVariant } from "../_lib/variants";
import { LedgerRowActions } from "./LedgerRowActions";

export type SelectableKind = "single_purchase" | "sale";

export interface SelectableRow {
  id: string;
  kind: SelectableKind;
}

function isSelectableKind(kind: TransactionKind): kind is SelectableKind {
  return kind === "single_purchase" || kind === "sale";
}

export interface LedgerTableCardInfo {
  id: string;
  name: string;
  setId: string;
  number: string;
  imageSmall: string;
}

export interface LedgerTableRow extends LedgerRow {
  setName: string | null;
  card: LedgerTableCardInfo | null;
  psaSubmissionId: string | null;
  psaCardCount: number | null;
  lotCardCount: number | null;
  variant: CardVariant | null;
}

interface Props {
  rows: LedgerTableRow[];
  // Currency to default the edit modals' inputs to. Equal to
  // displayCurrency in normal usage but kept as a separate prop so the
  // ActionsBar / row edit modals can be threaded the same value the
  // user picked in settings.
  defaultCurrency: LedgerCurrency;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
  selectedIds: ReadonlySet<string>;
  pendingDeleteIds: ReadonlySet<string>;
  onToggleSelected: (id: string, kind: SelectableKind) => void;
  onSelectVisible: (rows: SelectableRow[]) => void;
}

const KIND_LABEL: Record<TransactionKind, string> = {
  pack_purchase: "Pack",
  single_purchase: "Single",
  sale: "Sale",
  psa_fee: "PSA",
  lot_purchase: "Bulk lot",
};

// Variant labels rendered inline next to non-normal singles. Normal is
// the default-and-implicit case so it gets no label, keeping the most
// common variant visually quiet.
const VARIANT_CHIP_LABEL: Partial<Record<CardVariant, string>> = {
  holofoil: "Holo",
  reverseHolofoil: "Reverse",
};

interface DayGroup {
  key: string;
  date: Date;
  rows: LedgerTableRow[];
  dominantKind: TransactionKind;
  totalCents: number;
  approximate: boolean;
}

export function LedgerTable({
  rows,
  defaultCurrency,
  displayCurrency,
  latestRatesFromEur,
  selectedIds,
  pendingDeleteIds,
  onToggleSelected,
  onSelectVisible,
}: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel p-12 text-center">
        <p className="text-sm text-muted">
          No transactions match. Adjust the filters, or log a pack, a
          singles purchase, a sale, or a PSA submission.
        </p>
      </div>
    );
  }

  const groups = groupRowsByDay(rows, displayCurrency, latestRatesFromEur);

  const selectableVisible: SelectableRow[] = [];
  for (const r of rows) {
    if (isSelectableKind(r.kind)) {
      selectableVisible.push({ id: r.id, kind: r.kind });
    }
  }
  const selectableVisibleCount = selectableVisible.length;
  const selectedVisibleCount = selectableVisible.reduce(
    (acc, r) => acc + (selectedIds.has(r.id) ? 1 : 0),
    0,
  );
  const allChecked =
    selectableVisibleCount > 0 && selectedVisibleCount === selectableVisibleCount;
  const someChecked =
    selectedVisibleCount > 0 && selectedVisibleCount < selectableVisibleCount;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-panel">
      <table className="min-w-full text-sm">
        <thead className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
          <tr>
            <th className="w-9 px-3 py-2 font-medium">
              <HeaderCheckbox
                checked={allChecked}
                indeterminate={someChecked}
                disabled={selectableVisibleCount === 0}
                onChange={() => onSelectVisible(selectableVisible)}
              />
            </th>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Kind</th>
            <th className="px-4 py-2 font-medium">Description</th>
            <th className="px-4 py-2 font-medium text-right">Amount</th>
            <th className="px-2 py-2 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <DayGroupRows
              key={g.key}
              group={g}
              defaultCurrency={defaultCurrency}
              displayCurrency={displayCurrency}
              latestRatesFromEur={latestRatesFromEur}
              selectedIds={selectedIds}
              pendingDeleteIds={pendingDeleteIds}
              onToggleSelected={onToggleSelected}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeaderCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label="Select all visible"
      className="h-4 w-4 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

function DayGroupRows({
  group,
  defaultCurrency,
  displayCurrency,
  latestRatesFromEur,
  selectedIds,
  pendingDeleteIds,
  onToggleSelected,
}: {
  group: DayGroup;
  defaultCurrency: LedgerCurrency;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
  selectedIds: ReadonlySet<string>;
  pendingDeleteIds: ReadonlySet<string>;
  onToggleSelected: (id: string, kind: SelectableKind) => void;
}) {
  return (
    <>
      <DayHeaderRow
        group={group}
        displayCurrency={displayCurrency}
      />
      {group.rows.map((r) => (
        <Row
          key={r.id}
          row={r}
          kindLabel={
            r.kind === group.dominantKind ? null : KIND_LABEL[r.kind]
          }
          timeLabel={formatTime(r.occurredAt)}
          defaultCurrency={defaultCurrency}
          displayCurrency={displayCurrency}
          latestRatesFromEur={latestRatesFromEur}
          selected={selectedIds.has(r.id)}
          pending={pendingDeleteIds.has(r.id)}
          onToggleSelected={onToggleSelected}
        />
      ))}
    </>
  );
}

function DayHeaderRow({
  group,
  displayCurrency,
}: {
  group: DayGroup;
  displayCurrency: Currency;
}) {
  const count = group.rows.length;
  const positive = group.totalCents >= 0;
  const sign = positive ? "+" : "−";
  const totalText = `${sign}${formatMoneyCents(
    Math.abs(group.totalCents),
    displayCurrency,
  )}`;
  return (
    <tr className="bg-panel-2/50 text-[11px] uppercase tracking-wider text-muted">
      <td colSpan={6} className="px-4 py-1.5">
        <div className="flex items-center justify-between gap-4">
          <span>{formatDayLabel(group.date)}</span>
          <span className="tabular-nums">
            <span>
              · {count} transaction{count === 1 ? "" : "s"} ·{" "}
            </span>
            {group.approximate ? (
              <span
                className="italic"
                title="Some amounts converted at today's rate"
              >
                {totalText}
              </span>
            ) : (
              <span>{totalText}</span>
            )}
          </span>
        </div>
      </td>
    </tr>
  );
}

function Row({
  row,
  kindLabel,
  timeLabel,
  defaultCurrency,
  displayCurrency,
  latestRatesFromEur,
  selected,
  pending,
  onToggleSelected,
}: {
  row: LedgerTableRow;
  kindLabel: string | null;
  timeLabel: string;
  defaultCurrency: LedgerCurrency;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
  selected: boolean;
  pending: boolean;
  onToggleSelected: (id: string, kind: SelectableKind) => void;
}) {
  const positive = row.amountCents >= 0;
  const selectable = isSelectableKind(row.kind);
  const trClass = [
    "border-b border-border/60 last:border-b-0",
    pending ? "opacity-50 pointer-events-none" : "hover:bg-panel-2",
    selected ? "bg-accent/5" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <tr className={trClass}>
      <td className="w-9 px-3 py-2.5 align-middle">
        {selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() =>
              onToggleSelected(row.id, row.kind as SelectableKind)
            }
            aria-label="Select transaction"
            className="h-4 w-4 cursor-pointer accent-accent"
          />
        ) : (
          <span aria-hidden className="inline-block h-4 w-4" />
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-[11px] tabular-nums text-muted">
        {timeLabel}
      </td>
      <td className="px-4 py-2.5">
        {kindLabel && (
          <span className="rounded-md border border-border bg-panel-2 px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted">
            {kindLabel}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5">{renderDescription(row)}</td>
      <td
        className={[
          "whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums",
          positive ? "text-covered" : "text-missing",
        ].join(" ")}
      >
        {positive ? "+" : "−"}
        <MoneyDisplay
          cents={Math.abs(row.amountCents)}
          currency={row.currency}
          rateToEur={row.rateToEur}
          asOf={row.occurredAt}
          displayCurrency={displayCurrency}
          latestRatesFromEur={latestRatesFromEur}
        />
      </td>
      <td className="px-2 py-2.5">
        <RowActions row={row} defaultCurrency={defaultCurrency} />
      </td>
    </tr>
  );
}

function RowActions({
  row,
  defaultCurrency,
}: {
  row: LedgerTableRow;
  defaultCurrency: LedgerCurrency;
}) {
  if (row.kind === "pack_purchase" && row.packId) {
    return <LedgerRowActions kind="pack_purchase" packId={row.packId} />;
  }
  if (row.kind === "lot_purchase" && row.lotId) {
    return <LedgerRowActions kind="lot_purchase" lotId={row.lotId} />;
  }
  if (row.kind === "psa_fee" && row.psaSubmissionId) {
    return (
      <LedgerRowActions
        kind="psa_fee"
        psaSubmissionId={row.psaSubmissionId}
      />
    );
  }
  if (row.kind === "single_purchase" && row.card && row.quantity != null) {
    const unitCostCents = Math.round(Math.abs(row.amountCents) / row.quantity);
    return (
      <LedgerRowActions
        kind="single_purchase"
        defaultCurrency={defaultCurrency}
        card={row.card}
        transactionId={row.id}
        quantity={row.quantity}
        unitCostCents={unitCostCents}
        currency={row.currency}
        occurredAt={row.occurredAt}
        note={row.note}
        variant={row.variant}
      />
    );
  }
  if (row.kind === "sale" && row.card && row.quantity != null) {
    const unitProceedsCents = Math.round(row.amountCents / row.quantity);
    return (
      <LedgerRowActions
        kind="sale"
        defaultCurrency={defaultCurrency}
        card={row.card}
        transactionId={row.id}
        quantity={row.quantity}
        unitProceedsCents={unitProceedsCents}
        currency={row.currency}
        occurredAt={row.occurredAt}
        note={row.note}
        variant={row.variant}
      />
    );
  }
  return null;
}

function renderDescription(row: LedgerTableRow) {
  if (row.kind === "pack_purchase" && row.packId) {
    return (
      <Link
        href={`/packs/${row.packId}/edit`}
        className="text-text underline-offset-2 hover:underline"
      >
        Pack{row.setName ? ` from ${row.setName}` : ""}
      </Link>
    );
  }
  if ((row.kind === "single_purchase" || row.kind === "sale") && row.card) {
    return <CardLine row={row} card={row.card} />;
  }
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
  if (row.kind === "psa_fee" && row.psaSubmissionId) {
    const n = row.psaCardCount ?? 0;
    return (
      <Link
        href={`/transactions/psa/${row.psaSubmissionId}`}
        className="text-text underline-offset-2 hover:underline"
      >
        PSA submission
        {n > 0 && (
          <span className="ml-1 text-[11px] text-muted tabular-nums">
            · {n} card{n === 1 ? "" : "s"}
          </span>
        )}
        {row.note && <span className="ml-2 text-[11px] text-muted">· {row.note}</span>}
      </Link>
    );
  }
  if (row.note) return <span className="text-text">{row.note}</span>;
  return <span className="text-muted">—</span>;
}

function CardLine({
  row,
  card,
}: {
  row: LedgerTableRow;
  card: LedgerTableCardInfo;
}) {
  const qty = row.quantity && row.quantity > 1 ? ` × ${row.quantity}` : "";
  const variantLabel = row.variant ? VARIANT_CHIP_LABEL[row.variant] : null;
  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.imageSmall}
        alt=""
        className="h-8 w-6 shrink-0 rounded-sm object-cover"
        loading="lazy"
      />
      <div className="min-w-0">
        <Link
          href={`/cards/${encodeURIComponent(card.id)}`}
          className="text-text underline-offset-2 hover:underline"
        >
          {card.name}
          {qty}
        </Link>
        {variantLabel && (
          <span className="ml-1 text-[11px] lowercase tracking-wide text-muted">
            {variantLabel.toLowerCase()}
          </span>
        )}{" "}
        <span className="text-[11px] text-muted tabular-nums">
          {card.setId}-{card.number}
        </span>
        {row.note && <span className="ml-2 text-[11px] text-muted">· {row.note}</span>}
      </div>
    </div>
  );
}

function groupRowsByDay(
  rows: LedgerTableRow[],
  displayCurrency: Currency,
  latestRatesFromEur: Record<Currency, number>,
): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: { key: string; date: Date; rows: LedgerTableRow[] } | null = null;
  for (const r of rows) {
    const d = new Date(r.occurredAt);
    const key = localDayKey(d);
    if (!current || current.key !== key) {
      current = { key, date: d, rows: [] };
      groups.push({
        key,
        date: d,
        rows: current.rows,
        dominantKind: r.kind,
        totalCents: 0,
        approximate: false,
      });
    }
    current.rows.push(r);
  }
  for (const g of groups) {
    const counts: Partial<Record<TransactionKind, number>> = {};
    let total = 0;
    let approximate = false;
    for (const r of g.rows) {
      counts[r.kind] = (counts[r.kind] ?? 0) + 1;
      const converted = convertCents(
        r.amountCents,
        r.currency,
        displayCurrency,
        r.rateToEur,
        latestRatesFromEur,
      );
      if (converted == null) {
        approximate = true;
      } else {
        total += converted;
        if (r.rateToEur == null && r.currency !== displayCurrency) {
          approximate = true;
        }
      }
    }
    const firstKind = g.rows[0]?.kind ?? g.dominantKind;
    const dominantKind = pickDominantKind(counts, firstKind);
    g.dominantKind = dominantKind;
    g.totalCents = total;
    g.approximate = approximate;
  }
  return groups;
}

function pickDominantKind(
  counts: Partial<Record<TransactionKind, number>>,
  fallback: TransactionKind,
): TransactionKind {
  let best: TransactionKind = fallback;
  let bestCount = counts[fallback] ?? 0;
  for (const [k, c] of Object.entries(counts) as [TransactionKind, number][]) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

function localDayKey(d: Date): string {
  if (Number.isNaN(d.getTime())) return "invalid";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(d: Date): string {
  if (Number.isNaN(d.getTime())) return "Unknown date";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const label = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return isToday ? `Today · ${label}` : label;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
