"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { Logo } from "./Logo";
import { AccountStub } from "./AccountStub";
import { usePageTitle } from "../_lib/PageTitleContext";

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
          <Settings className="h-[18px] w-[18px]" aria-hidden />
        </Link>
      </div>
    </header>
  );
}
