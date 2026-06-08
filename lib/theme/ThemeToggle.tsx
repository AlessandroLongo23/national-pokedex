"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/lib/components/ui/Button";

export function ThemeToggle() {
  const { toggleTheme } = useTheme();

  return (
    <Button
      variant="secondary"
      size="md"
      iconOnly
      aria-label="Toggle theme"
      onClick={toggleTheme}
      // Mobile: floor the tap target at 44px; desktop keeps the 36px md control size.
      className="min-h-[44px] min-w-[44px] md:min-h-[var(--lume-control-h-md)] md:min-w-[var(--lume-control-h-md)]"
    >
      <span className="relative flex size-5 items-center justify-center">
        <Sun
          strokeWidth={1.5}
          className="absolute size-5 rotate-0 scale-100 text-zinc-950 transition-all duration-500 dark:-rotate-90 dark:scale-0 dark:text-zinc-50"
        />
        <Moon
          strokeWidth={1.5}
          className="absolute size-5 rotate-90 scale-0 text-zinc-950 transition-all duration-500 dark:rotate-0 dark:scale-100 dark:text-zinc-50"
        />
      </span>
    </Button>
  );
}
