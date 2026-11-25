"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/ui/components/sidebar";
import { Skeleton } from "@repo/ui/components/skeleton";
import { SidebarSectionLabel } from "@repo/ui/components/sidebar-chrome";
import { noMatchMessage } from "@repo/ui/lib/sidebar-menu-filter";

import {
  activePreschoolHref,
  preschoolNavFor,
  type PreschoolNavItem,
} from "@/lib/preschool-nav";
import { preschoolMeQueryOptions } from "@/src/queries/preschool/me";

import { PRESCHOOL_NAV_ICONS } from "./preschool-nav-icons";
import { filterMenu, SIDEBAR_ROW_CLASS } from "./sidebar-nav";

/** Fixed, so the server render and the browser agree. */
const SKELETON_WIDTHS = ["72%", "64%", "80%", "58%", "70%", "62%"];

function NavLinks({
  items,
  activeHref,
}: {
  items: readonly PreschoolNavItem[];
  activeHref: string | null;
}) {
  return (
    <SidebarMenu className="gap-1">
      {items.map((item) => {
        const Icon = PRESCHOOL_NAV_ICONS[item.href];
        const active = item.href === activeHref;
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
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/**
 * A Preschool Workspace's menu (ADR-0055), by the Preschool role from
 * `/api/preschool/me`: Head Office first for the Owner of several Centres,
 * then the Centre's daily work, then Setup. Rows wait for that answer, so a
 * Teacher never sees the Owner's menu.
 */
export function PreschoolSidebarNav({ query }: { query: string }) {
  const pathname = usePathname() || "/";
  const { data: me, isPending } = useQuery(preschoolMeQueryOptions());

  if (me == null) {
    return (
      <SidebarGroup className="px-3 pt-2">
        <SidebarSectionLabel>Main menu</SidebarSectionLabel>
        <SidebarGroupContent>
          {isPending ? (
            <div className="flex flex-col gap-1" aria-busy="true">
              {SKELETON_WIDTHS.map((width) => (
                <Skeleton
                  key={width}
                  className="bg-sidebar-accent h-10 rounded-xl"
                  style={{ width }}
                />
              ))}
            </div>
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const nav = preschoolNavFor(me);
  const manager = me.role === "owner" || me.role === "centre_head";
  const groups = [
    { label: "Head Office", items: filterMenu(nav.headOffice, query) },
    {
      label: manager ? "This Centre" : "Main menu",
      items: filterMenu(nav.main, query),
    },
    { label: "Setup", items: filterMenu(nav.setup, query) },
  ];
  const activeHref = activePreschoolHref(
    pathname,
    [...nav.headOffice, ...nav.main, ...nav.setup].map((item) => item.href),
  );

  if (groups.every((group) => group.items.length === 0))
    return (
      <SidebarGroup className="px-3 pt-2">
        <p className="text-sidebar-foreground/55 px-3 py-2 text-sm">
          {noMatchMessage(query)}
        </p>
      </SidebarGroup>
    );
  return (
    <>
      {groups.map((group) =>
        group.items.length === 0 ? null : (
          <SidebarGroup key={group.label} className="px-3 pt-2">
            <SidebarSectionLabel>{group.label}</SidebarSectionLabel>
            <SidebarGroupContent>
              <nav aria-label={group.label}>
                <NavLinks items={group.items} activeHref={activeHref} />
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        ),
      )}
    </>
  );
}
