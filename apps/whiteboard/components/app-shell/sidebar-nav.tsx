"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/ui/components/sidebar";
import { SidebarMenuCount } from "@repo/ui/components/sidebar-chrome";
import {
  labelMatches,
  menuQuery,
  noMatchMessage,
} from "@repo/ui/lib/sidebar-menu-filter";

import {
  isAppNavActive,
  type AppNavHref,
  type AppNavItem,
} from "@/lib/app-nav";
import type { DashboardResponse } from "@/src/queries/dashboard";

import { APP_NAV_ICONS } from "./app-nav-icons";
import { useSidebarDashboard } from "./use-sidebar-dashboard";

/** A sidebar row (ADR-0049): 40 px, the active row on the primary pill. */
export const SIDEBAR_ROW_CLASS =
  "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:[&_svg]:text-sidebar-primary-foreground data-active:font-semibold h-10 gap-3 rounded-xl px-3 transition-colors [&_svg]:size-[18px] [&_svg]:text-sidebar-foreground/65 hover:[&_svg]:text-sidebar-foreground";

/** The rows the menu search keeps (`@repo/ui`'s rule, shared with Construction Management). */
export function filterMenu<Item extends { label: string }>(
  items: readonly Item[],
  query: string,
): Item[] {
  const needle = menuQuery(query);
  return items.filter((item) => labelMatches(item.label, needle));
}

function countFor(
  href: AppNavHref,
  dashboard: DashboardResponse | undefined,
): ReactNode {
  if (dashboard == null) return null;
  if (href === "/students") {
    return (
      <SidebarMenuCount
        label={`${dashboard.activeStudentCount} active Students`}
      >
        {dashboard.activeStudentCount}
      </SidebarMenuCount>
    );
  }
  if (href === "/batches" && dashboard.todayBatches.length > 0) {
    return (
      <SidebarMenuCount
        label={`${dashboard.todayBatches.length} Batches today`}
      >
        {dashboard.todayBatches.length}
      </SidebarMenuCount>
    );
  }
  if (href === "/fees" && dashboard.feeFollowUpsDueCount > 0) {
    return (
      <SidebarMenuCount
        tone="alert"
        label={`${dashboard.feeFollowUpsDueCount} Fee Follow-ups due`}
      >
        {dashboard.feeFollowUpsDueCount > 99
          ? "99+"
          : dashboard.feeFollowUpsDueCount}
      </SidebarMenuCount>
    );
  }
  return null;
}

/**
 * The Main navigation for the role, filtered by the sidebar search. Owners
 * see counts from the Owner Dashboard at the right end of a few rows.
 */
export function SidebarMainNav({
  items,
  query,
}: {
  items: readonly AppNavItem[];
  query: string;
}) {
  const pathname = usePathname() || "/";
  const dashboard = useSidebarDashboard();
  const shown = filterMenu(items, query);

  return (
    <nav aria-label="Main">
      {shown.length === 0 ? (
        <p className="text-sidebar-foreground/55 px-3 py-2 text-sm">
          {noMatchMessage(query)}
        </p>
      ) : (
        <SidebarMenu className="gap-1">
          {shown.map((item) => {
            const Icon = APP_NAV_ICONS[item.href];
            const active = isAppNavActive(pathname, item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.label}
                  aria-current={active ? "page" : undefined}
                  className={SIDEBAR_ROW_CLASS}
                  render={<Link href={item.href} />}
                >
                  <Icon />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {countFor(item.href, dashboard)}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      )}
    </nav>
  );
}
