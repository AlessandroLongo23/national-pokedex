"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { VARIANTS } from "@/lib/data";
import { officialArtworkUrl } from "@/lib/pokeapi";
import type { RegionalVariant, VariantRegion } from "@/lib/data/types";

const REGION_LABEL: Record<VariantRegion, string> = {
  alola: "Alolan",
  galar: "Galarian",
  hisui: "Hisuian",
  paldea: "Paldean",
};

interface Props {
  variantKey: string;
}

export function VariantPagination({ variantKey }: Props) {
  const router = useRouter();
  const i = VARIANTS.findIndex((v) => v.variantKey === variantKey);
  const prev = i > 0 ? VARIANTS[i - 1]! : null;
  const next = i >= 0 && i < VARIANTS.length - 1 ? VARIANTS[i + 1]! : null;

  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === "ArrowLeft" && prev) router.push(`/variants/${prev.variantKey}`);
      if (e.key === "ArrowRight" && next) router.push(`/variants/${next.variantKey}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  return (
    <nav
      aria-label="Regional Variant navigation"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      className="relative flex items-center justify-between px-4 py-1 text-xs md:px-5"
    >
      {prev ? (
        <PagerLink form={prev} direction="prev" />
      ) : (
        <span aria-hidden className="w-32" />
      )}
      {next ? (
        <PagerLink form={next} direction="next" />
      ) : (
        <span aria-hidden className="w-32" />
      )}
    </nav>
  );
}

function PagerLink({ form, direction }: { form: RegionalVariant; direction: "prev" | "next" }) {
  const isPrev = direction === "prev";
  const art = (
    <Image
      src={officialArtworkUrl(form.artworkId ?? form.baseDex)}
      alt=""
      width={28}
      height={28}
      unoptimized
      className="h-7 w-7 shrink-0 object-contain opacity-80 group-hover/pager:opacity-100"
    />
  );
  return (
    <Link
      href={`/variants/${form.variantKey}`}
      className="group/pager flex min-h-9 items-center gap-2 rounded-md px-2 py-1 text-muted transition hover:bg-panel-2 hover:text-text active:bg-panel-3 active:text-text"
      aria-label={`${isPrev ? "Previous" : "Next"}: ${form.displayName}`}
    >
      {isPrev && (
        <ArrowLeft
          aria-hidden
          className="h-4 w-4 transition-transform group-hover/pager:-translate-x-0.5"
        />
      )}
      {isPrev && art}
      <span className="flex flex-col items-start leading-tight">
        <span className="eyebrow text-[10px] text-variant/70">{REGION_LABEL[form.region]}</span>
        <span className="text-xs font-medium">{form.displayName}</span>
      </span>
      {!isPrev && art}
      {!isPrev && (
        <ArrowRight
          aria-hidden
          className="h-4 w-4 transition-transform group-hover/pager:translate-x-0.5"
        />
      )}
    </Link>
  );
}
