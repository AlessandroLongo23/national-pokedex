"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  useSidebarCollapseContext,
  useMobileMenu,
  useSidebarForceExpanded,
} from "./sidebarContext";
import { Tooltip } from "@/lib/components/ui/Tooltip";

export type SidebarNavItem = {
  name: string;
  url: string;
  icon: LucideIcon | ((p: { className?: string }) => React.ReactElement);
  matcher?: (pathname: string) => boolean;
};

export type SidebarNavGroup = {
  title?: string;
  items: SidebarNavItem[];
};

interface SidebarProps {
  identity?: React.ReactNode;
  navGroups: SidebarNavGroup[];
  pinnedLinks?: SidebarNavItem[];
  userCard?: React.ReactNode;
}

function defaultMatch(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: SidebarNavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = item.matcher
    ? item.matcher(pathname)
    : defaultMatch(pathname, item.url);
  const Icon = item.icon;

  return (
    <Tooltip label={collapsed ? item.name : undefined} side="right">
      <Link
        href={item.url}
        onClick={onNavigate}
        className={`flex items-center overflow-hidden rounded-md text-sm transition-colors ${
          isActive
            ? "bg-primary/10 text-accent dark:bg-primary/20 dark:text-accent"
            : "text-muted-foreground hover:bg-panel-2 hover:text-foreground"
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center">
          <Icon className="h-5 w-5" />
        </span>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              key="label"
              initial={{ opacity: 0, width: 0, marginLeft: 0 }}
              animate={{ opacity: 1, width: "auto", marginLeft: 12 }}
              exit={{ opacity: 0, width: 0, marginLeft: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="truncate whitespace-nowrap"
            >
              {item.name}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    </Tooltip>
  );
}

export function Sidebar({ identity, navGroups, pinnedLinks, userCard }: SidebarProps) {
  const { collapsed } = useSidebarCollapseContext();
  const { setOpen: setMobileOpen } = useMobileMenu();
  const forceExpanded = useSidebarForceExpanded();
  const effectiveCollapsed = forceExpanded ? false : collapsed;
  const onNavigate = forceExpanded ? () => setMobileOpen(false) : undefined;

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-2 pt-3 pb-2 pl-4 ${
        effectiveCollapsed ? "pr-2" : "pr-3"
      }`}
    >
      {identity && <div className="shrink-0">{identity}</div>}

      <nav className="no-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden">
        {navGroups.map((group, gi) => (
          <div
            key={group.title ?? `group-${gi}`}
            className="flex flex-col gap-1"
            role="group"
            aria-label={group.title}
          >
            {group.title && (
              <div className="relative mx-1 h-3.5">
                <AnimatePresence initial={false}>
                  {effectiveCollapsed ? (
                    gi > 0 && (
                      <motion.div
                        key="sep"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15, delay: 0.2 }}
                        className="absolute inset-0 flex items-center"
                        aria-hidden
                      >
                        <div className="h-px w-full bg-border" />
                      </motion.div>
                    )
                  ) : (
                    <motion.p
                      key="title"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, delay: 0.2 }}
                      className="absolute inset-0 flex items-center whitespace-nowrap text-xs leading-none uppercase tracking-wide text-muted"
                    >
                      {group.title}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.url}
                  item={item}
                  collapsed={effectiveCollapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {pinnedLinks && pinnedLinks.length > 0 && (
        <div className="flex shrink-0 flex-col gap-0.5">
          {pinnedLinks.map((item) => (
            <NavLink
              key={item.url}
              item={item}
              collapsed={effectiveCollapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      {userCard && (
        <div className="shrink-0 border-t border-border pt-2">
          {userCard}
        </div>
      )}
    </div>
  );
}
