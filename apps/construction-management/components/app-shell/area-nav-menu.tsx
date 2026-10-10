"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@repo/ui/components/sidebar";

import { isAppNavActive, type AppNavHref } from "@/lib/app-nav";

import { APP_NAV_ICONS } from "./app-nav-icons";

export type AreaNavGroup = {
  label: string;
  sections: readonly { href: string; label: string; icon: LucideIcon }[];
};

/**
 * A top-level area in the sidebar with a submenu of its screens, grouped
 * (Masters, Workspace). The submenu opens by itself on any page of the area
 * and can be folded away elsewhere.
 */
export function AreaNavMenu({
  href,
  label,
  groups,
  currentHref,
  pathname,
  buttonClassName,
}: {
  href: AppNavHref;
  label: string;
  groups: readonly AreaNavGroup[];
  /** The submenu entry the page belongs to, if any. */
  currentHref: string | undefined;
  pathname: string;
  buttonClassName: string;
}) {
  const inArea = isAppNavActive(pathname, href);
  const [open, setOpen] = useState(inArea);
  // Arriving on a page of the area opens the submenu (state adjusted in render).
  const [wasInArea, setWasInArea] = useState(inArea);
  if (inArea !== wasInArea) {
    setWasInArea(inArea);
    if (inArea) setOpen(true);
  }

  const Icon = APP_NAV_ICONS[href];
  const onIndex = pathname === href;

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarMenuButton
          isActive={inArea && currentHref == null}
          tooltip={label}
          aria-current={onIndex ? "page" : undefined}
          className={buttonClassName}
          render={<Link href={href} />}
        >
          <Icon />
          <span>{label}</span>
        </SidebarMenuButton>
        <CollapsibleTrigger
          aria-label={open ? `Hide ${label} list` : `Show ${label} list`}
          render={
            <SidebarMenuAction className="top-3 right-2 data-panel-open:[&>svg]:rotate-90" />
          }
        >
          <ChevronRight className="transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub aria-label={label} className="mt-1">
            {groups.map((group) => (
              <li key={group.label} className="mt-2 first:mt-1">
                <p
                  id={groupLabelId(label, group.label)}
                  className="text-sidebar-foreground/55 px-2 pb-1 text-[0.7rem] font-semibold tracking-wide uppercase"
                >
                  {group.label}
                </p>
                <ul
                  aria-labelledby={groupLabelId(label, group.label)}
                  className="flex flex-col gap-0.5"
                >
                  {group.sections.map((section) => {
                    const active = currentHref === section.href;
                    return (
                      <SidebarMenuSubItem key={section.href}>
                        <SidebarMenuSubButton
                          isActive={active}
                          aria-current={active ? "page" : undefined}
                          className="text-sidebar-foreground/80"
                          render={<Link href={section.href} />}
                        >
                          <section.icon />
                          <span>{section.label}</span>
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
