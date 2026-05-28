"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CardEntry } from "@/lib/data/types";
import {
  formatPriceCompact,
  pickPrice,
  type CardPrice,
  type DisplayConversion,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";

interface Props {
  cards: CardEntry[];
  prices: Record<string, CardPrice>;
  priceSource: PriceSource;
  display: DisplayConversion;
}

// Compact, scannable strip — narrower tiles than CardRail (w-24 vs w-32)
// so more pulls fit above the fold, with each tile annotated by price
// and set code.
export function RecentPullsStrip({ cards, prices, priceSource, display }: Props) {
  return (
    <section className="space-y-3" data-rail="recent-pack-pulls">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">Latest pulls</h2>
        <Link
          href="/packs"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          All packs
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </header>
      {cards.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-xs text-muted">
          Log a pack to see your latest pulls here.
        </p>
      ) : (
        <div
          className="-mr-4 flex snap-x gap-2 overflow-x-auto pb-2 pr-4"
          style={{
            WebkitMaskImage:
              "linear-gradient(to right, black 0, black calc(100% - 32px), transparent 100%)",
            maskImage:
              "linear-gradient(to right, black 0, black calc(100% - 32px), transparent 100%)",
          }}
        >
          {cards.map((card) => {
            const price = pickPrice(prices[card.id], priceSource);
            return (
              <Link
                key={card.id}
                href={`/cards/${encodeURIComponent(card.id)}`}
                prefetch={false}
                className="group w-24 shrink-0 snap-start text-left focus-visible:outline-none"
                aria-label={`Open ${card.name}`}
              >
                <div
                  className="overflow-hidden rounded-[5px] border border-transparent bg-panel-2 transition group-hover:border-border-strong group-focus-visible:border-accent"
                  style={{ aspectRatio: "245 / 342" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.imageSmall}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-1.5 text-[10px] tabular-nums leading-tight">
                  <span className="truncate text-muted" title={card.setId}>
                    {card.setId}
                  </span>
                  <span className={price != null ? "font-medium text-text" : "text-muted"}>
                    {price != null ? formatPriceCompact(price, priceSource, display) : "—"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
