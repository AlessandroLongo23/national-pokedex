"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import type { LedgerCurrency } from "@/lib/ledger/money";
import { LogSaleModal } from "../../../transactions/_components/LogSaleModal";

interface CardInfo {
  id: string;
  name: string;
  setId: string;
  number: string;
  imageSmall: string;
}

interface Props {
  card: CardInfo;
  ownedQty: number;
  suggestedUnitProceedsCents: number | null;
  defaultCurrency: LedgerCurrency;
}

// Houses ledger-write actions for one card. For phase 4 only "Sell" is
// wired (gated on owning at least one copy). Future phases can extend
// this row with PSA submission, etc.
export function CardActionsBar({
  card,
  ownedQty,
  suggestedUnitProceedsCents,
  defaultCurrency,
}: Props) {
  const [sellOpen, setSellOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setSellOpen(true)}
        disabled={ownedQty === 0}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs font-medium text-text transition hover:border-accent/60 hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40"
        title={
          ownedQty === 0
            ? "You don't own this card"
            : `Sell up to ${ownedQty} copies`
        }
      >
        <Tag className="h-3.5 w-3.5" aria-hidden />
        Sell {ownedQty > 1 ? `(up to ${ownedQty})` : ""}
      </button>

      <LogSaleModal
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        defaultCurrency={defaultCurrency}
        presetCard={card}
        presetMaxQty={ownedQty}
        suggestedUnitProceedsCents={suggestedUnitProceedsCents}
      />
    </div>
  );
}
