"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { AccountStub } from "./AccountStub";
import { usePageTitle } from "../_lib/PageTitleContext";

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
    </svg>
  );
}

export function MobileHeader() {
  const title = usePageTitle();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-panel px-4 md:hidden">
      <Logo compact />
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{title}</h1>
      <div className="flex items-center gap-3">
        <AccountStub variant="icon" />
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-panel-2 hover:text-text"
        >
          <SettingsIcon className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </header>
  );
}
