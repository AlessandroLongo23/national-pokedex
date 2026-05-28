import Link from "next/link";

interface PokeballIconProps {
  className?: string;
  centerFill?: string;
}

export function PokeballIcon({
  className,
  centerFill = "var(--lume-surface-raised)",
}: PokeballIconProps) {
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

interface PokedexLogoProps {
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { icon: "size-4", text: "text-lg" },
  md: { icon: "size-5", text: "text-xl" },
  lg: { icon: "size-7", text: "text-3xl" },
};

export function PokedexLogo({ size = "md" }: PokedexLogoProps) {
  const { icon, text } = sizeMap[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold tracking-tight ${text}`}
    >
      <PokeballIcon className={`${icon} text-primary`} />
      Pókedex<span className="text-primary">.</span>
    </span>
  );
}

interface LinkedPokedexLogoProps extends PokedexLogoProps {
  href?: string;
}

export function LinkedPokedexLogo({ size, href = "/dashboard" }: LinkedPokedexLogoProps) {
  return (
    <Link href={href} aria-label="Pókedex — go to dashboard">
      <PokedexLogo size={size} />
    </Link>
  );
}
