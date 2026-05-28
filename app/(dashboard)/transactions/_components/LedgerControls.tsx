"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LedgerCurrency } from "@/lib/ledger/money";
import type { Currency } from "@/lib/pricing/currencies";
import { deleteTransactionsBatch } from "../_lib/transaction-actions";
import { LedgerFilters, type KindFilter, type TimeRange } from "./LedgerFilters";
import { LedgerSelectionBar } from "./LedgerSelectionBar";
import {
  LedgerTable,
  type LedgerTableRow,
  type SelectableKind,
  type SelectableRow,
} from "./LedgerTable";
import { UndoToast } from "./UndoToast";

interface Props {
  rows: LedgerTableRow[];
  defaultCurrency: LedgerCurrency;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
}

interface PendingDelete {
  items: SelectableRow[];
  ids: ReadonlySet<string>;
  expiresAt: number;
}

const UNDO_WINDOW_MS = 5000;

export function LedgerControls({
  rows,
  defaultCurrency,
  displayCurrency,
  latestRatesFromEur,
}: Props) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const timerRef = useRef<number | null>(null);

  const filteredRows = useMemo(
    () => applyFilters(rows, kind, search, timeRange),
    [rows, kind, search, timeRange],
  );

  // Drop selected IDs that no longer exist in the source data (e.g. after
  // a deletion repaints). Keep IDs that are merely filtered out: the
  // selection survives filter changes by design.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const allIds = new Set(rows.map((r) => r.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (allIds.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
  }, [rows, selectedIds]);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Pending deletion silently expires on unmount rather than firing,
  // since navigation away might be unintentional.
  useEffect(() => () => clearTimer(), []);

  const handleToggleSelected = (id: string, _k: SelectableKind) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectVisible = (visible: SelectableRow[]) => {
    setSelectedIds((prev) => {
      const allSelected =
        visible.length > 0 && visible.every((r) => prev.has(r.id));
      const next = new Set(prev);
      if (allSelected) {
        for (const r of visible) next.delete(r.id);
      } else {
        for (const r of visible) next.add(r.id);
      }
      return next;
    });
  };

  const handleClear = () => setSelectedIds(new Set());

  const handleDelete = () => {
    const items: SelectableRow[] = [];
    for (const r of rows) {
      if (!selectedIds.has(r.id)) continue;
      if (r.kind === "single_purchase" || r.kind === "sale") {
        items.push({ id: r.id, kind: r.kind });
      }
    }
    if (items.length === 0) return;
    const ids = new Set(items.map((r) => r.id));
    const expiresAt = performance.now() + UNDO_WINDOW_MS;
    setPending({ items, ids, expiresAt });
    setSelectedIds(new Set());
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void (async () => {
        try {
          await deleteTransactionsBatch(items);
        } finally {
          setPending(null);
        }
      })();
    }, UNDO_WINDOW_MS);
  };

  const handleUndo = () => {
    clearTimer();
    setPending(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <LedgerFilters
        kind={kind}
        onKindChange={setKind}
        search={search}
        onSearchChange={setSearch}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />

      {selectedIds.size > 0 && (
        <LedgerSelectionBar
          selectedCount={selectedIds.size}
          onDelete={handleDelete}
          onClear={handleClear}
        />
      )}

      <LedgerTable
        rows={filteredRows}
        defaultCurrency={defaultCurrency}
        displayCurrency={displayCurrency}
        latestRatesFromEur={latestRatesFromEur}
        selectedIds={selectedIds}
        pendingDeleteIds={pending?.ids ?? EMPTY_SET}
        onToggleSelected={handleToggleSelected}
        onSelectVisible={handleSelectVisible}
      />

      {pending && (
        <UndoToast
          count={pending.items.length}
          expiresAt={pending.expiresAt}
          onUndo={handleUndo}
        />
      )}
    </div>
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set();

function applyFilters(
  rows: LedgerTableRow[],
  kind: KindFilter,
  search: string,
  timeRange: TimeRange,
): LedgerTableRow[] {
  const trimmedQuery = search.trim().toLowerCase();
  const cutoff =
    timeRange === "all"
      ? null
      : Date.now() - (timeRange === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;

  return rows.filter((r) => {
    if (kind !== "all" && r.kind !== kind) return false;
    if (cutoff !== null) {
      const t = new Date(r.occurredAt).getTime();
      if (Number.isNaN(t) || t < cutoff) return false;
    }
    if (trimmedQuery) {
      const cardName = r.card?.name?.toLowerCase() ?? "";
      const setCode = r.card
        ? `${r.card.setId}-${r.card.number}`.toLowerCase()
        : "";
      const setName = r.setName?.toLowerCase() ?? "";
      if (
        !cardName.includes(trimmedQuery) &&
        !setCode.includes(trimmedQuery) &&
        !setName.includes(trimmedQuery)
      ) {
        return false;
      }
    }
    return true;
  });
}
