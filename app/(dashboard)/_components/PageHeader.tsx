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
    <div className="flex w-full flex-row items-center justify-between gap-4">
      <SetPageTitle title={resolvedTitle} />
      <div className="flex min-w-0 items-center gap-4">
        {Icon && (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/60">
            <Icon className="size-5 text-zinc-900 dark:text-zinc-50" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 truncate text-sm font-normal text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-row items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
