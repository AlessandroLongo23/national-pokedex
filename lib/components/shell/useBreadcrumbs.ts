"use client";

import { useMemo } from "react";
import { useBreadcrumbOverrides } from "@/app/(dashboard)/_lib/PageTitleContext";
import type { BreadcrumbItem } from "./Breadcrumbs";

// Route label map. Any segment can also be overridden at runtime by a page
// (via useSetPageTitle / useSetCrumb) so dynamic routes surface a real name
// — and a secondary detail — instead of the raw slug or id.
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
  edit: "Edit",
};

function labelFor(segment: string): string {
  return (
    ROUTE_LABELS[segment] ??
    segment.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function useBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const overrides = useBreadcrumbOverrides();

  return useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return [];

    const items: BreadcrumbItem[] = [];
    let href = "";
    segments.forEach((segment, idx) => {
      href += `/${segment}`;
      const isLast = idx === segments.length - 1;
      const override = overrides[segment];
      items.push({
        label: override?.label || labelFor(segment),
        detail: override?.detail,
        href: isLast ? undefined : (override?.href ?? href),
      });
    });
    return items;
  }, [pathname, overrides]);
}
