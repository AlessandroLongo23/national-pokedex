"use client";

import { useState } from "react";

type Size = "sm" | "lg" | "header" | "hero";

const IMG_CLASS: Record<Size, string> = {
  sm: "h-10 w-[120px] flex-shrink-0 object-contain",
  lg: "max-h-16 w-auto max-w-[80%] object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.3)]",
  header:
    "block h-14 w-auto max-w-[320px] object-contain object-left drop-shadow-[0_3px_12px_rgba(0,0,0,0.3)] md:h-20",
  hero: "block h-24 w-auto max-w-[480px] object-contain object-center drop-shadow-[0_4px_18px_rgba(0,0,0,0.35)] md:h-32",
};

const FALLBACK_CLASS: Record<Size, string> = {
  sm: "flex h-10 w-[120px] flex-shrink-0 items-center justify-center text-center text-xs font-semibold tracking-tight text-text",
  lg: "text-sm font-bold tracking-tight text-text",
  header: "block text-3xl font-bold tracking-tight text-text md:text-4xl",
  hero: "block text-center text-4xl font-bold tracking-tight text-text md:text-5xl",
};

export function SetLogo({
  setId,
  setName,
  logoUrl,
  size = "lg",
}: {
  setId: string;
  setName: string;
  logoUrl?: string;
  size?: Size;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className={FALLBACK_CLASS[size]}>{setName}</span>;
  }
  const src = logoUrl ?? `https://images.pokemontcg.io/${setId}/logo.png`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={setName}
      onError={() => setFailed(true)}
      loading="lazy"
      draggable={false}
      referrerPolicy="no-referrer"
      className={IMG_CLASS[size]}
    />
  );
}
