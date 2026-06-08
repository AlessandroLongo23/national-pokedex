import Link from "next/link";
import { Plus } from "lucide-react";

export function LogPackFab() {
  return (
    <Link
      href="/packs/new"
      aria-label="Log a new pack"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_rgb(96_165_250/0.55),0_2px_6px_-2px_rgb(0_0_0/0.6)] transition active:scale-95 md:hidden"
    >
      <Plus className="h-6 w-6" aria-hidden strokeWidth={2} />
    </Link>
  );
}
