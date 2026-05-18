import Link from "next/link";

export function PokeballIcon({
  className,
  centerFill = "var(--color-panel)",
}: {
  className?: string;
  centerFill?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill={centerFill} stroke="none" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  const iconSize = compact ? "h-5 w-5" : "h-5 w-5";
  return (
    <Link
      href="/dashboard"
      className="flex items-baseline gap-2.5"
      aria-label="Pókedex — go to dashboard"
    >
      <PokeballIcon className={`${iconSize} shrink-0 text-accent`} />
      <span className="text-lg font-bold tracking-tight text-text">Pókedex</span>
    </Link>
  );
}

export function LogoBlock() {
  return (
    <div>
      <Logo />
      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted">Binder tracker</p>
    </div>
  );
}
