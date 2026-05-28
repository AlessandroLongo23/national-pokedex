"use client";

import { useMemo } from "react";
import { usePageTitle } from "@/app/(dashboard)/_lib/PageTitleContext";
import type { BreadcrumbItem } from "./Breadcrumbs";

// Single-segment route label map. The final segment also gets overridden
// by the live PageTitle if a page set one — that lets dynamic routes
// (e.g. /sets/[setId]) surface a real name instead of the slug.
const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  pokedex: "Pokédex",
  megas: "Mega Evolutions",
  sets: "Sets",
  cards: "Cards",
  other: "Other cards",
  items: "Items",
  supporters: "Supporters",
  stadiums: "Stadiums",
  tools: "Pokémon Tools",
  energies: "Energies",
  binders: "Binders",
  collection: "Collection",
  portfolio: "Portfolio",
  packs: "Packs",
  transactions: "Transactions",
  psa: "PSA",
  wishlist: "Wishlist",
  settings: "Settings",
  new: "New",
};

function labelFor(segment: string): string {
  return (
    ROUTE_LABELS[segment] ??
    segment.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function useBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const pageTitle = usePageTitle();

  return useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return [];

    const items: BreadcrumbItem[] = [];
    let href = "";
    segments.forEach((segment, idx) => {
      href += `/${segment}`;
      const isLast = idx === segments.length - 1;
      const label = isLast && pageTitle ? pageTitle : labelFor(segment);
      items.push({ label, href: isLast ? undefined : href });
    });
    return items;
  }, [pathname, pageTitle]);
}
