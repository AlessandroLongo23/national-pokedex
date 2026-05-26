import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Award, Package } from "lucide-react";
import { getSet } from "@/lib/data";
import { formatMoneyCents, type LedgerCurrency } from "@/lib/ledger/money";
import { Separator } from "../../../_components/Separator";

export interface PackEvent {
  kind: "pack";
  packId: string;
  setId: string;
  openedAt: string;
  costCents: number | null;
  currency: LedgerCurrency | null;
}

export interface TxEvent {
  kind: "single_purchase" | "sale" | "psa_fee";
  occurredAt: string;
  amountCents: number;
  currency: LedgerCurrency;
  quantity: number | null;
  note: string | null;
}

export type AcquisitionEvent = PackEvent | TxEvent;

interface Props {
  events: AcquisitionEvent[];
  ownedQty: number;
  acquiredAt: string | null;
}

export function AcquisitionLog({ events, ownedQty, acquiredAt }: Props) {
  if (ownedQty === 0 && events.length === 0) return null;

  // Sort newest first; pack opens use openedAt, transactions use occurredAt.
  const sorted = [...events].sort((a, b) => {
    const at = a.kind === "pack" ? a.openedAt : a.occurredAt;
    const bt = b.kind === "pack" ? b.openedAt : b.occurredAt;
    return bt.localeCompare(at);
  });

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">Acquisition</p>
        {acquiredAt && (
          <p className="text-[11px] text-muted nums">
            Owned since {formatDayMaybeYear(acquiredAt)}
          </p>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {acquiredAt
            ? `Marked owned on ${formatDay(acquiredAt)}. No pack or transaction log yet.`
            : "Owned, but no event history recorded yet."}
        </p>
      ) : (
        <ol className="mt-4 divide-y divide-border/60">
          {sorted.map((ev, i) => (
            <li key={i}>
              <EventRow event={ev} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function EventRow({ event }: { event: AcquisitionEvent }) {
  if (event.kind === "pack") {
    const set = getSet(event.setId);
    return (
      <Link
        href={`/packs/${event.packId}/edit`}
        className="group flex items-center gap-3 py-2.5 transition hover:bg-panel-2/40"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-2 text-muted transition group-hover:bg-panel-3 group-hover:text-accent">
          <Package className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm text-text">
            Pulled from{" "}
            <span className="font-medium">{set?.name ?? event.setId}</span>
          </span>
          <span className="text-[11px] text-muted nums">
            {formatDayMaybeYear(event.openedAt)}
          </span>
        </div>
        {event.costCents != null && event.currency && (
          <span className="text-[11px] text-muted nums">
            pack {formatMoneyCents(event.costCents, event.currency)}
          </span>
        )}
        <ArrowUpRight
          className="h-3.5 w-3.5 text-muted/50 transition group-hover:text-accent"
          aria-hidden
        />
      </Link>
    );
  }

  const KindIcon =
    event.kind === "sale"
      ? ArrowUpRight
      : event.kind === "psa_fee"
        ? Award
        : ArrowDownLeft;
  const label =
    event.kind === "sale"
      ? "Sold"
      : event.kind === "psa_fee"
        ? "PSA grading"
        : "Bought";
  const amountColor =
    event.kind === "sale" ? "text-covered" : "text-muted";
  const amountSign = event.kind === "sale" ? "+" : "−";
  const amountAbs = Math.abs(event.amountCents);

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-2 text-muted">
        <KindIcon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm text-text">
          {label}
          {event.quantity != null && event.quantity > 1 && (
            <span className="text-muted"> ×{event.quantity}</span>
          )}
        </span>
        <span className="text-[11px] text-muted nums">
          {formatDayMaybeYear(event.occurredAt)}
        </span>
        {event.note && (
          <>
            <Separator tone="muted" />
            <span className="truncate text-[11px] text-muted">
              {event.note}
            </span>
          </>
        )}
      </div>
      <span className={`text-xs font-medium nums ${amountColor}`}>
        {amountSign}
        {formatMoneyCents(amountAbs, event.currency)}
      </span>
    </div>
  );
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDayMaybeYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}
