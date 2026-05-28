"use client";

import type { ReactNode, ElementType } from "react";
import { useSetPageTitle } from "../_lib/PageTitleContext";

interface PageHeaderProps {
  /** The page title. Typically a string; pages that need an inline editor
   * (e.g. binder rename) can pass a ReactNode and a `mobileTitle` string to
   * drive the breadcrumb. */
  title: string | ReactNode;
  /** String form of the title, used to drive the breadcrumb / page-title
   * context. Defaults to `title` when it's a string. */
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
  // Drive the breadcrumb's final segment from the live title — gives dynamic
  // routes (e.g. /sets/[setId]) a real name without route-map upkeep.
  const resolvedTitle = mobileTitle ?? (typeof title === "string" ? title : "");
  useSetPageTitle(resolvedTitle);

  return (
    <div className="flex w-full flex-row items-center justify-between gap-4">
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
