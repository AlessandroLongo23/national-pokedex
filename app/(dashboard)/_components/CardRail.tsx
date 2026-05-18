"use client";

import Link from "next/link";
import type { CardEntry } from "@/lib/data/types";
import { CardTile } from "./CardTile";

interface Props {
  title: string;
  subtitle?: string;
  cards: CardEntry[];
  emptyMessage?: string;
  href?: string;
  rail?: string;
}

export function CardRail({
  title,
  subtitle,
  cards,
  emptyMessage = "Nothing here yet.",
  href,
  rail,
}: Props) {
  return (
    <section className="space-y-2" data-rail={rail}>
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="text-xs text-accent hover:underline">
            View all →
          </Link>
        )}
      </header>
      {cards.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted">
          {emptyMessage}
        </p>
      ) : (
        <div className="flex snap-x gap-3 overflow-x-auto pb-2">
          {cards.map((c) => (
            <div key={c.id} className="w-32 shrink-0 snap-start">
              <CardTile card={c} density="compact" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
