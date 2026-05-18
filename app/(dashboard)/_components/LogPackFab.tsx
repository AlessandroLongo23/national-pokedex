import Link from "next/link";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function LogPackFab() {
  return (
    <Link
      href="/packs/new"
      aria-label="Log a new pack"
      className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-bg shadow-[0_8px_24px_-6px_rgb(96_165_250/0.55),0_2px_6px_-2px_rgb(0_0_0/0.6)] transition active:scale-95 md:hidden"
    >
      <PlusIcon className="h-6 w-6" />
    </Link>
  );
}
