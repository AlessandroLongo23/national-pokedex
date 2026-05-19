"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronRight,
  CreditCard,
  FolderOpen,
  Layers,
  LineChart,
  MoreHorizontal,
  Notebook,
  Package,
  Receipt,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { LogoBlock, PokeballIcon } from "./Logo";
import { AccountStub } from "./AccountStub";

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon | ((p: { className?: string }) => React.ReactElement);
  children?: { href: string; label: string }[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Browse",
    items: [
      { href: "/pokedex", label: "Pokédex", Icon: PokeballIcon },
      { href: "/sets", label: "Sets", Icon: Layers },
      { href: "/cards", label: "Cards", Icon: CreditCard },
      {
        href: "/other",
        label: "Other cards",
        Icon: MoreHorizontal,
        children: [
          { href: "/other/items", label: "Items" },
          { href: "/other/supporters", label: "Supporters" },
          { href: "/other/stadiums", label: "Stadiums" },
          { href: "/other/tools", label: "Pokémon Tools" },
          { href: "/other/energies", label: "Energies" },
        ],
      },
    ],
  },
  {
    label: "Collection",
    items: [
      { href: "/binders", label: "Binders", Icon: Notebook },
      { href: "/collection", label: "Collection", Icon: FolderOpen },
      { href: "/portfolio", label: "Portfolio", Icon: LineChart },
    ],
  },
  {
    label: "Activity",
    items: [
      { href: "/packs", label: "Packs", Icon: Package },
      { href: "/transactions", label: "Transactions", Icon: Receipt },
    ],
  },
];

const NAV_FLAT: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.Icon;
  const hasChildren = !!item.children?.length;
  const [open, setOpen] = useState(active);
  const showChildren = hasChildren && (active || open);

  const baseClasses = [
    "flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition",
    active
      ? "border-accent bg-accent/10 font-semibold text-text"
      : "border-transparent text-muted hover:bg-panel-2 hover:text-text",
  ].join(" ");

  if (!hasChildren) {
    return (
      <li>
        <Link href={item.href} className={baseClasses}>
          <Icon className="h-[18px] w-[18px] shrink-0" />
          <span>{item.label}</span>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <div className="flex items-stretch">
        <Link href={item.href} className={`${baseClasses} flex-1`}>
          <Icon className="h-[18px] w-[18px] shrink-0" />
          <span>{item.label}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={showChildren ? `Collapse ${item.label}` : `Expand ${item.label}`}
          aria-expanded={showChildren}
          className="ml-1 inline-flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-panel-2 hover:text-text"
        >
          <ChevronRight
            aria-hidden
            className={`h-3 w-3 transition-transform ${showChildren ? "rotate-90" : ""}`}
          />
        </button>
      </div>
      {showChildren && (
        <ul className="mt-0.5 space-y-0.5 pl-9">
          {item.children!.map((child) => {
            const childActive = isActive(pathname, child.href);
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  className={[
                    "block rounded-md border-l-2 px-3 py-1.5 text-[13px] transition",
                    childActive
                      ? "border-accent bg-accent/10 font-medium text-text"
                      : "border-transparent text-muted hover:bg-panel-2 hover:text-text",
                  ].join(" ")}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-border bg-panel md:flex">
      <div className="px-5 pt-6 pb-8">
        <LogoBlock />
      </div>

      <nav className="flex-1 px-3">
        <div className="space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted/60">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.href} item={item} pathname={pathname} />
                ))}
              </ul>
            </div>
          ))}
        </div>
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
          <Settings className="h-[18px] w-[18px] shrink-0" />
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
      {NAV_FLAT.map((item) => {
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
