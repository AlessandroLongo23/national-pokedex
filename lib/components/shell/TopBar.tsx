"use client";

import { Menu } from "lucide-react";
import { PokedexLogo } from "@/lib/components/ui/PokedexLogo";
import { useMobileMenu } from "./sidebarContext";
import { Button } from "@/lib/components/ui/Button";

interface TopBarProps {
  rightCluster: React.ReactNode;
  leftCluster?: React.ReactNode;
}

export function TopBar({ rightCluster, leftCluster }: TopBarProps) {
  const { setOpen } = useMobileMenu();

  return (
    <div className="flex h-full min-w-0 items-center justify-between gap-4 px-4 ps-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="md:hidden"
        >
          <Menu />
        </Button>
        <div className="md:hidden">
          <PokedexLogo size="sm" />
        </div>
        {leftCluster && (
          <div className="hidden min-w-0 items-center md:flex">{leftCluster}</div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">{rightCluster}</div>
    </div>
  );
}
