"use client";

import { useSetPageTitle } from "../_lib/PageTitleContext";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
  mobileTitle,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  mobileTitle?: string;
}) {
  const resolved = mobileTitle ?? (typeof title === "string" ? title : "");
  useSetPageTitle(resolved);

  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div>
        {eyebrow && (
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
