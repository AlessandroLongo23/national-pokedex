"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  // Secondary context shown beside the label in a muted color (e.g. a card's
  // set name and number). Hidden on narrow screens to keep the bar legible.
  detail?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5 text-sm"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        const isLink = Boolean(item.href) && !isLast;
        return (
          <Fragment key={`${idx}-${item.label}`}>
            {idx > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-muted" />
            )}
            {isLink ? (
              <Link
                href={item.href!}
                className="truncate text-text-secondary transition-colors hover:text-text"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className="flex min-w-0 items-baseline gap-1.5"
                aria-current={isLast ? "page" : undefined}
              >
                <span
                  className={
                    isLast
                      ? "min-w-0 truncate font-medium text-text"
                      : "min-w-0 truncate text-text-secondary"
                  }
                >
                  {item.label}
                </span>
                {item.detail && (
                  <span className="hidden shrink-0 whitespace-nowrap font-normal text-muted sm:inline">
                    {item.detail}
                  </span>
                )}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
