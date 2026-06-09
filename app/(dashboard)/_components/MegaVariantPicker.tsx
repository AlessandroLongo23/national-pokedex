"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { SPECIES } from "@/lib/data";
import type { CardEntry, MegaForm } from "@/lib/data/types";
import { VariantRow } from "./CardVariantPicker";

interface Props {
  form: MegaForm | null;
  onClose: () => void;
}

/** Mega/Primal counterpart of CardVariantPicker: lists the card variants that
 * print a given Mega form so they can be marked owned/wishlisted. */
export function MegaVariantPicker({ form, onClose }: Props) {
  const [cards, setCards] = useState<CardEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const formKey = form?.formKey ?? null;

  useEffect(() => {
    if (formKey == null) return;
    setLoading(true);
    setCards(null);
    fetch(`/api/cards-by-mega/${formKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: CardEntry[]) => setCards(data))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [formKey]);

  useEffect(() => {
    if (formKey == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formKey, onClose]);

  if (form == null) return null;
  const species = SPECIES[form.baseDex];
  const count = cards?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="relative max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-border bg-panel md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border p-4">
          <Image
            src={officialArtworkUrl(form.artworkId ?? form.baseDex)}
            alt=""
            width={64}
            height={64}
            unoptimized
            className="h-14 w-14 shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted nums">
              <span className="rounded-sm bg-mega/85 px-[3px] text-[9px] font-bold leading-none text-bg">
                {form.isPrimal ? "P" : "M"}
              </span>
              <span>
                {form.isPrimal ? "Primal" : "Mega"} · {cards ? count : "…"} card
                {count === 1 ? "" : "s"}
              </span>
            </div>
            <div className="text-lg font-bold">{form.displayName}</div>
            {species && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <span>Gen {form.gen}</span>
                <span>·</span>
                <span>{(form.types?.length ? form.types : species.types).join(" / ")}</span>
              </div>
            )}
          </div>
          <Link
            href={`/megas/${form.formKey}`}
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-accent"
          >
            Full details
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2.5 md:p-1.5 text-muted transition hover:bg-panel-2 hover:text-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="max-h-[calc(88vh-92px)] overflow-y-auto p-3">
          {loading && (
            <div className="py-12 text-center text-sm text-muted">Loading cards…</div>
          )}
          {cards && cards.length === 0 && (
            <div className="py-12 text-center text-sm text-muted">
              No card variants found for this Mega form.
            </div>
          )}
          {cards && cards.length > 0 && (
            <ul className="space-y-1">
              {cards.map((c) => (
                <VariantRow key={c.id} card={c} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
