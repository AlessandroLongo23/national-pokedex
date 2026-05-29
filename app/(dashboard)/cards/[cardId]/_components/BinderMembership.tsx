"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useOwnedCards } from "../../../_lib/OwnedCardsContext";

interface BinderRef {
  id: string;
  name: string;
  href: string;
}

interface Props {
  binders: BinderRef[];
  cardId: string;
}

// Read-only roll-up of which of the user's binders this card belongs to, plus
// whether the user owns it (covered) or the binder still needs it (missing).
// Server-side scope matching decides membership; ownership is read live from
// the optimistic OwnedCardsContext so the state flips the instant the user
// marks the card owned from the action bar above.
//
// TODO: pokedex/pokemon scopes are species-level — a slot can be satisfied by a
// DIFFERENT print. This v1 reports state per THIS card only; refine to
// species-level coverage (useOwnedCards().isSpeciesOwned) if desired later.
export function BinderMembership({ binders, cardId }: Props) {
  const { quantityOf } = useOwnedCards();
  const owned = quantityOf(cardId) > 0;

  if (binders.length === 0) return null;

  // All rows share the same state (it depends only on whether THIS card is
  // owned), but sort by name for stable ordering. Were states to differ,
  // "needs it" (actionable) would sort ahead of "owned".
  const sorted = [...binders].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="border-t border-border pt-4">
      <p className="eyebrow">Your binders</p>
      <ul className="mt-3 flex flex-col gap-2">
        {sorted.map((binder) => (
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
                  owned ? "bg-covered" : "bg-missing",
                ].join(" ")}
              />
              <span className="truncate font-medium">{binder.name}</span>
            </Link>
            {owned ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-covered">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                Owned
              </span>
            ) : (
              <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-missing">
                Needs it
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
