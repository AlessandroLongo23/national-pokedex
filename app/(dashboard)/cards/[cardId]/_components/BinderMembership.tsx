"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useOwnedCards } from "../../../_lib/OwnedCardsContext";
import { useUser } from "../../../_lib/UserContext";

interface BinderRef {
  id: string;
  name: string;
  href: string;
  /** Dex range for pokedex-scope binders, else null. When set, the binder is
   *  satisfied at the species level: owning any card for an in-range dex#
   *  covers that slot, so a different print of an owned Pokémon reads as
   *  "covered", not "needed". Null binders collect each specific card. */
  coverageRange: { from: number; to: number } | null;
}

interface Props {
  binders: BinderRef[];
  cardId: string;
  /** This card's national dex number(s) — usually one. */
  dexNumbers: number[];
  /** This card's Mega form key, if it resolves to a single Mega/Primal form. */
  megaFormKey: string | null;
  /** This card's regional-variant form key, if it resolves to one. */
  variantFormKey: string | null;
}

type RowState = "owned" | "covered" | "needs";

const STATE_RANK: Record<RowState, number> = { needs: 0, covered: 1, owned: 2 };

// Read-only roll-up of which of the user's binders this card belongs to and
// whether each is satisfied. Pokedex-scope binders resolve coverage at the
// species level (mirroring the Pokédex grid and deriveSpecies): you don't
// "need" a card whose dex slot another owned card already fills. Ownership is
// read live from the optimistic OwnedCardsContext, so states flip the instant
// you mark the card owned from the action bar above.
export function BinderMembership({
  binders,
  cardId,
  dexNumbers,
  megaFormKey,
  variantFormKey,
}: Props) {
  const { quantityOf, isSpeciesOwned, isMegaFormOwned, isVariantFormOwned } =
    useOwnedCards();
  const { treatMegasAsSeparate, treatVariantsAsSeparate } = useUser();

  if (binders.length === 0) return null;

  const ownThisCard = quantityOf(cardId) > 0;

  // Is this card's pokedex slot already satisfied by any owned card (this one
  // or another print of the same Pokémon)? A Mega-form card is satisfied by its
  // form when Megas are tracked as separate slots; a regional-variant card by
  // its variant form when variants are tracked separately — both match
  // deriveSpecies. A card carries at most one of megaFormKey / variantFormKey.
  const slotCovered = (range: { from: number; to: number }): boolean => {
    if (treatMegasAsSeparate && megaFormKey) return isMegaFormOwned(megaFormKey);
    if (treatVariantsAsSeparate && variantFormKey)
      return isVariantFormOwned(variantFormKey);
    const lo = Math.min(range.from, range.to);
    const hi = Math.max(range.from, range.to);
    const inRange = dexNumbers.filter((d) => d >= lo && d <= hi);
    return inRange.length > 0 && inRange.every((d) => isSpeciesOwned(d));
  };

  const stateOf = (b: BinderRef): RowState => {
    if (ownThisCard) return "owned";
    if (b.coverageRange && slotCovered(b.coverageRange)) return "covered";
    return "needs";
  };

  // Surface actionable binders first: needs → covered → owned, then by name.
  const rows = binders
    .map((binder) => ({ binder, state: stateOf(binder) }))
    .sort(
      (a, b) =>
        STATE_RANK[a.state] - STATE_RANK[b.state] ||
        a.binder.name.localeCompare(b.binder.name),
    );

  return (
    <div className="border-t border-border pt-4">
      <p className="eyebrow">Your binders</p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map(({ binder, state }) => (
          <li
            key={binder.id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <Link
              href={binder.href}
              className="inline-flex min-w-0 items-center gap-2 text-text underline-offset-2 hover:text-accent hover:underline"
            >
              <span
                aria-hidden
                className={[
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  state === "needs" ? "bg-missing" : "bg-covered",
                ].join(" ")}
              />
              <span className="truncate font-medium">{binder.name}</span>
            </Link>
            <StateLabel state={state} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StateLabel({ state }: { state: RowState }) {
  if (state === "needs") {
    return (
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-missing">
        Needs it
      </span>
    );
  }
  if (state === "owned") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-covered">
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
        Owned
      </span>
    );
  }
  // Covered: you don't own this exact card, but the species slot is already
  // filled by another card you own, so the binder doesn't need this one.
  return (
    <span
      className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-covered"
      title="Covered by another card of this Pokémon you own"
    >
      Covered
    </span>
  );
}
