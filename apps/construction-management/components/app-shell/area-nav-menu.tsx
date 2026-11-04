"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
} from "@repo/ui/components/collapsible";
import { SidebarSectionLabel } from "@repo/ui/components/sidebar-chrome";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@repo/ui/components/sidebar";

import { isAppNavActive, type AppNavHref } from "@/lib/app-nav";

import { APP_NAV_ICONS } from "./app-nav-icons";
import { SUBMENU_BUTTON_CLASS, SUBMENU_CLASS, SubmenuRow } from "./submenu-row";

export type AreaNavGroup = {
  /** Shown above the group; an area with one group can leave it out. */
  label?: string;
  sections: readonly { href: string; label: string; icon: LucideIcon }[];
};

/**
 * A top-level area in the sidebar with a submenu of its screens, grouped
 * (Masters, Workspace, Human Resources). The submenu opens by itself on any
 * page of the area and can be folded away elsewhere. A page of the area is
 * one under its link or one a submenu entry owns (`currentHref`): Human
 * Resources links to Staff, and Role Management, HRMS and the Labour lists
 * sit beside it. While the menu search has a query, `groups` are the
 * matching ones and `forceOpen` holds the submenu open (`menu-filter.ts`).
 */
export function AreaNavMenu({
  href,
  linkHref,
  label,
  groups,
  currentHref,
  pathname,
  buttonClassName,
  forceOpen = false,
}: {
  href: AppNavHref;
  /** Where the area link goes when not `href` (Human Resources without Staff). */
  linkHref?: string;
  label: string;
  groups: readonly AreaNavGroup[];
  /** The submenu entry the page belongs to, if any. */
  currentHref: string | undefined;
  pathname: string;
  buttonClassName: string;
  /** Held open while the menu search matches something in the area. */
  forceOpen?: boolean;
}) {
  const inArea = isAppNavActive(pathname, href) || currentHref != null;
  const [open, setOpen] = useState(inArea);
  // Arriving on a page of the area opens the submenu (state adjusted in render).
  const [wasInArea, setWasInArea] = useState(inArea);
  if (inArea !== wasInArea) {
    setWasInArea(inArea);
    if (inArea) setOpen(true);
  }

  const Icon = APP_NAV_ICONS[href];
  // The area's own page, unless a submenu entry is that page too.
  const onIndex = pathname === href && currentHref == null;
  const shownOpen = open || forceOpen;

  return (
    <SidebarMenuItem>
      <Collapsible open={shownOpen} onOpenChange={setOpen}>
        <SubmenuRow
          button={
            <SidebarMenuButton
              isActive={inArea && currentHref == null}
              tooltip={label}
              aria-current={onIndex ? "page" : undefined}
              className={buttonClassName}
              render={<Link href={linkHref ?? href} />}
            >
              <Icon />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </SidebarMenuButton>
          }
          label={label}
          open={shownOpen}
        />
        <CollapsibleContent>
          <SidebarMenuSub aria-label={label} className={SUBMENU_CLASS}>
            {groups.map((group) => (
              <li key={group.label ?? label} className="mt-3 first:mt-0">
                {group.label != null && (
                  <SidebarSectionLabel
                    id={groupLabelId(label, group.label)}
                    className="h-7 px-2.5"
                  >
                    {group.label}
                  </SidebarSectionLabel>
                )}
                <ul
                  aria-labelledby={
                    group.label == null
                      ? undefined
                      : groupLabelId(label, group.label)
                  }
                  className="flex flex-col gap-1"
                >
                  {group.sections.map((section) => {
                    const active = currentHref === section.href;
                    return (
                      <SidebarMenuSubItem key={section.href}>
                        <SidebarMenuSubButton
                          isActive={active}
                          aria-current={active ? "page" : undefined}
                          className={SUBMENU_BUTTON_CLASS}
                          render={<Link href={section.href} />}
                        >
                          <section.icon />
                          <span className="min-w-0 flex-1 truncate">
                            {section.label}
                          </span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </ul>
              </li>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function groupLabelId(area: string, group: string): string {
  return `${slug(area)}-group-${slug(group)}`;
}
