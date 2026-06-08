"use client";

import { useState } from "react";
import Link from "next/link";
import { Award, Layers, Plus, Tag } from "lucide-react";
import type { LedgerCurrency } from "@/lib/ledger/money";
import { LogSaleModal } from "./LogSaleModal";
import { LogSingleModal } from "./LogSingleModal";
import { NewPsaModal } from "./NewPsaModal";

interface Props {
  defaultCurrency: LedgerCurrency;
}

// The home for ledger-write actions on /transactions. Pack purchases
// are still logged from /packs/new (the existing flow). Singles
// purchases, sales, and PSA submissions all live here.
export function ActionsBar({ defaultCurrency }: Props) {
  const [singleOpen, setSingleOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [psaOpen, setPsaOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSingleOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Log a singles purchase
        </button>
        <button
          type="button"
          onClick={() => setSaleOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-panel-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Tag className="h-3.5 w-3.5" aria-hidden />
          Log a sale
        </button>
        <button
          type="button"
          onClick={() => setPsaOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-panel-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Award className="h-3.5 w-3.5" aria-hidden />
          New PSA submission
        </button>
        <Link
          href="/transactions/lots/new"
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-panel-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Log a bulk lot
        </Link>
      </div>

      <LogSingleModal
        open={singleOpen}
        onClose={() => setSingleOpen(false)}
        defaultCurrency={defaultCurrency}
      />
      <LogSaleModal
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        defaultCurrency={defaultCurrency}
      />
      <NewPsaModal
        open={psaOpen}
        onClose={() => setPsaOpen(false)}
        defaultCurrency={defaultCurrency}
      />
    </>
  );
}
