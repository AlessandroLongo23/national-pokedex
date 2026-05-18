"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { POKEDEX } from "@/lib/data";

type IconProps = { className?: string };

const I = {
  Dashboard: ({ className }: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2.75" y="2.75" width="6.5" height="8" rx="1.25" />
      <rect x="10.75" y="2.75" width="6.5" height="4.5" rx="1.25" />
      <rect x="2.75" y="12.75" width="6.5" height="4.5" rx="1.25" />
      <rect x="10.75" y="9.25" width="6.5" height="8" rx="1.25" />
    </svg>
  ),
  Pokedex: ({ className }: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M2.75 10h14.5" />
      <circle cx="10" cy="10" r="2.25" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1" fill="var(--color-bg)" stroke="none" />
    </svg>
  ),
  Sets: ({ className }: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="5.25" y="2.75" width="9.5" height="13" rx="1.25" />
      <path d="M3.5 5.5v11A1.25 1.25 0 0 0 4.75 17.75h9.5" />
    </svg>
  ),
  Packs: ({ className }: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2.75" y="6.75" width="14.5" height="10.5" rx="1.5" />
      <path d="M2.75 10h14.5" />
      <path d="M10 6.75v10.5" />
      <path d="M7 6.5c0-1.5 1-2.75 2.5-2.75S12 5 12 6.5" />
    </svg>
  ),
  Wishlist: ({ className }: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 16.5s-6.25-3.75-6.25-8.25a3.5 3.5 0 0 1 6.25-2.2 3.5 3.5 0 0 1 6.25 2.2c0 4.5-6.25 8.25-6.25 8.25z" />
    </svg>
  ),
};

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: I.Dashboard },
  { href: "/pokedex", label: "Pokédex", Icon: I.Pokedex },
  { href: "/sets", label: "Sets", Icon: I.Sets },
  { href: "/packs", label: "Packs", Icon: I.Packs },
  { href: "/wishlist", label: "Wishlist", Icon: I.Wishlist },
];

export function Sidebar() {
  const pathname = usePathname();
  const { ownedSpecies, ownedCards } = useOwnedCards();

  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-border bg-panel md:flex">
      <div className="px-5 pt-6 pb-8">
        <Link href="/dashboard" className="flex items-baseline gap-2.5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-accent"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.2" fill="var(--color-panel)" stroke="none" />
          </svg>
          <span className="text-lg font-bold tracking-tight text-text">Pókedex</span>
        </Link>
        <p className="mt-1 text-[11px] uppercase tracking-wider text-muted">Binder tracker</p>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.Icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    "flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition",
                    active
                      ? "border-accent bg-accent/10 font-semibold text-text"
                      : "border-transparent text-muted hover:bg-panel-2 hover:text-text",
                  ].join(" ")}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mx-3 mb-4 rounded-md border border-border bg-panel-2 px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-wider text-muted">Owned</div>
        <div className="mt-0.5 flex items-baseline gap-1.5 nums">
          <span className="text-lg font-bold text-owned">{ownedSpecies.size}</span>
          <span className="text-xs text-muted">/ {POKEDEX.length}</span>
        </div>
        <div className="mt-0.5 text-[10px] text-muted nums">{ownedCards.size} cards</div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-30 flex border-t border-border bg-panel md:hidden">
      {NAV.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const Icon = item.Icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] uppercase tracking-wider transition",
              active ? "text-accent" : "text-muted",
            ].join(" ")}
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
