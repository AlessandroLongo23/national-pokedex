import Link from "next/link";
import { type LedgerCurrency } from "@/lib/ledger/money";
import type { LedgerRow, TransactionKind } from "@/lib/ledger/aggregates";
import type { Currency } from "@/lib/pricing/currencies";
import { MoneyDisplay } from "../../_components/MoneyDisplay";
import { LedgerRowActions } from "./LedgerRowActions";

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
}

const KIND_LABEL: Record<TransactionKind, string> = {
  pack_purchase: "Pack",
  single_purchase: "Single",
  sale: "Sale",
  psa_fee: "PSA",
};

export function LedgerTable({
  rows,
  defaultCurrency,
  displayCurrency,
  latestRatesFromEur,
}: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-panel p-12 text-center">
        <p className="text-sm text-muted">
          No transactions yet. Log a pack with a price, or use the buttons above
          to record a singles purchase.
        </p>
        <Link
          href="/packs/new"
          className="mt-3 inline-block text-xs text-accent underline-offset-2 hover:underline"
        >
          Log a pack
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-panel">
      <table className="min-w-full text-sm">
        <thead className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
          <tr>
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
          {rows.map((r) => (
            <Row
              key={r.id}
              row={r}
              defaultCurrency={defaultCurrency}
              displayCurrency={displayCurrency}
              latestRatesFromEur={latestRatesFromEur}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  row,
  defaultCurrency,
  displayCurrency,
  latestRatesFromEur,
}: {
  row: LedgerTableRow;
  defaultCurrency: LedgerCurrency;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
}) {
  const positive = row.amountCents >= 0;
  return (
    <tr className="border-b border-border/60 last:border-b-0 hover:bg-panel-2">
      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">
        {formatDate(row.occurredAt)}
      </td>
      <td className="px-4 py-2.5">
        <span className="rounded-md border border-border bg-panel-2 px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted">
          {KIND_LABEL[row.kind]}
        </span>
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
        </Link>{" "}
        <span className="text-[11px] text-muted tabular-nums">
          {card.setId}-{card.number}
        </span>
        {row.note && <span className="ml-2 text-[11px] text-muted">· {row.note}</span>}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
