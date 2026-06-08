import type { ReactNode, ElementType } from "react";
import { SetPageTitle } from "./SetPageTitle";

interface PageHeaderProps {
  title: string | ReactNode;
  mobileTitle?: string;
  subtitle?: string;
  icon?: ElementType;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  mobileTitle,
  subtitle,
  icon: Icon,
  actions,
}: PageHeaderProps) {
  const resolvedTitle = mobileTitle ?? (typeof title === "string" ? title : "");

  return (
    // Mobile: stack the title block over the actions so wide actions (e.g. the
    // Pokédex/binder progress column) don't crush the H1 to zero. Desktop keeps
    // the single-row, space-between layout exactly (md:flex-row md:justify-between).
    <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
      <SetPageTitle title={resolvedTitle} />
      <div className="flex min-w-0 items-center gap-4">
        {Icon && (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/60">
            <Icon className="size-5 text-zinc-900 dark:text-zinc-50" />
          </span>
        )}
        <div className="min-w-0">
          {/* On mobile the title/subtitle wrap instead of truncating so no info
              is lost in the narrow column; desktop keeps the single-line
              truncation (md:truncate) exactly as before. */}
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-zinc-900 md:truncate md:text-3xl dark:text-zinc-50">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm font-normal text-zinc-500 md:truncate dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex w-full flex-row items-center gap-2 md:w-auto md:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
