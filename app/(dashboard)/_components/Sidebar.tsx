"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoBlock } from "./Logo";
import { AccountStub } from "./AccountStub";

type IconProps = { className?: string };

const I = {
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
  Cards: ({ className }: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.25" y="5.25" width="9" height="12" rx="1.25" />
      <path d="M6.5 3.25h8a1.25 1.25 0 0 1 1.25 1.25v11" />
    </svg>
  ),
  Binders: ({ className }: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3.25" y="2.75" width="13.5" height="14.5" rx="1.25" />
      <path d="M3.25 6.25h13.5M3.25 10h13.5M3.25 13.75h13.5" />
    </svg>
  ),
  Collection: ({ className }: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h3l1.25 1.5h6.75a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15z" />
    </svg>
  ),
  Settings: ({ className }: IconProps) => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </svg>
  ),
};

const NAV = [
  { href: "/pokedex", label: "Pokédex", Icon: I.Pokedex },
  { href: "/sets", label: "Sets", Icon: I.Sets },
  { href: "/cards", label: "Cards", Icon: I.Cards },
  { href: "/binders", label: "Binders", Icon: I.Binders },
  { href: "/collection", label: "Collection", Icon: I.Collection },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-border bg-panel md:flex">
      <div className="px-5 pt-6 pb-8">
        <LogoBlock />
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
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

      <div className="border-t border-border px-3 py-3">
        <Link
          href="/settings"
          className={[
            "flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition",
            isActive(pathname, "/settings")
              ? "border-accent bg-accent/10 font-semibold text-text"
              : "border-transparent text-muted hover:bg-panel-2 hover:text-text",
          ].join(" ")}
        >
          <I.Settings className="h-[18px] w-[18px] shrink-0" />
          <span>Settings</span>
        </Link>
        <div className="mt-1">
          <AccountStub variant="row" />
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-30 flex border-t border-border bg-panel md:hidden">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
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
