"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil } from "lucide-react";
import type { LedgerCurrency } from "@/lib/ledger/money";
import { useOwnedCards } from "../../_lib/OwnedCardsContext";
import {
  LogSingleModal,
  type SinglePurchaseEdit,
} from "./LogSingleModal";
import { LogSaleModal, type SingleSaleEdit } from "./LogSaleModal";
import { Tooltip } from "../../_components/Tooltip";

interface CardInfo {
  id: string;
  name: string;
  setId: string;
  number: string;
  imageSmall: string;
}

type Props =
  | {
      kind: "pack_purchase";
      packId: string;
    }
  | {
      kind: "psa_fee";
      psaSubmissionId: string;
    }
  | {
      kind: "single_purchase";
      defaultCurrency: LedgerCurrency;
      card: CardInfo;
      transactionId: string;
      quantity: number;
      unitCostCents: number;
      currency: LedgerCurrency;
      occurredAt: string;
      note: string | null;
    }
  | {
      kind: "sale";
      defaultCurrency: LedgerCurrency;
      card: CardInfo;
      transactionId: string;
      quantity: number;
      unitProceedsCents: number;
      currency: LedgerCurrency;
      occurredAt: string;
      note: string | null;
    };

// One Edit affordance per ledger row. For pack/PSA rows we link to the
// existing dedicated editors; for singles and sales we open the right
// modal in editing mode, keeping the rest of the page mounted.
export function LedgerRowActions(props: Props) {
  const [open, setOpen] = useState(false);
  const { quantityOf } = useOwnedCards();

  const button = (onClick?: () => void) => (
    <Tooltip content="Edit">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-panel-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Edit transaction"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Tooltip>
  );

  if (props.kind === "pack_purchase") {
    return (
      <Tooltip content="Edit pack">
        <Link
          href={`/packs/${props.packId}/edit`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-panel-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Edit pack"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </Tooltip>
    );
  }

  if (props.kind === "psa_fee") {
    return (
      <Tooltip content="Edit submission">
        <Link
          href={`/transactions/psa/${props.psaSubmissionId}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-panel-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Edit submission"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </Tooltip>
    );
  }

  if (props.kind === "single_purchase") {
    const editing: SinglePurchaseEdit = {
      transactionId: props.transactionId,
      card: props.card,
      quantity: props.quantity,
      unitCostCents: props.unitCostCents,
      currency: props.currency,
      occurredAt: props.occurredAt,
      note: props.note,
    };
    return (
      <>
        {button(() => setOpen(true))}
        <LogSingleModal
          open={open}
          onClose={() => setOpen(false)}
          defaultCurrency={props.defaultCurrency}
          editing={editing}
        />
      </>
    );
  }

  // sale
  const editing: SingleSaleEdit = {
    transactionId: props.transactionId,
    card: props.card,
    quantity: props.quantity,
    unitProceedsCents: props.unitProceedsCents,
    currency: props.currency,
    occurredAt: props.occurredAt,
    note: props.note,
  };
  // The RPC's "not enough copies" check compares against current
  // owned_cards; the existing sale's quantity is already removed from
  // owned, so the cap for "still legal" is ownedQty + this row's qty.
  const presetMaxQty = quantityOf(props.card.id) + props.quantity;
  return (
    <>
      {button(() => setOpen(true))}
      <LogSaleModal
        open={open}
        onClose={() => setOpen(false)}
        defaultCurrency={props.defaultCurrency}
        presetMaxQty={presetMaxQty}
        editing={editing}
      />
    </>
  );
}
