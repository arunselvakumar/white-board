"use client";

import { ChevronRight } from "lucide-react";
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

import { isAppNavActive } from "@/lib/app-nav";
import { MASTERS_GROUPS, activeMastersSection } from "@/lib/masters-nav";

import { APP_NAV_ICONS } from "./app-nav-icons";

const MASTERS_HREF = "/app/masters";

/**
 * Masters in the sidebar: the area link plus a submenu of every master,
 * grouped. The submenu opens by itself on any Masters page and can be
 * folded away elsewhere.
 */
export function MastersNavMenu({
  pathname,
  buttonClassName,
}: {
  pathname: string;
  buttonClassName: string;
}) {
  const inMasters = isAppNavActive(pathname, MASTERS_HREF);
  const [open, setOpen] = useState(inMasters);
  // Arriving on a Masters page opens the submenu (state adjusted in render).
  const [wasInMasters, setWasInMasters] = useState(inMasters);
  if (inMasters !== wasInMasters) {
    setWasInMasters(inMasters);
    if (inMasters) setOpen(true);
  }

  const current = activeMastersSection(pathname);
  const Icon = APP_NAV_ICONS[MASTERS_HREF];
  const onIndex = pathname === MASTERS_HREF;

  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarMenuButton
          isActive={inMasters && current == null}
          tooltip="Masters"
          aria-current={onIndex ? "page" : undefined}
          className={buttonClassName}
          render={<Link href={MASTERS_HREF} />}
        >
          <Icon />
          <span>Masters</span>
        </SidebarMenuButton>
        <CollapsibleTrigger
          aria-label={open ? "Hide Masters list" : "Show Masters list"}
          render={
            <SidebarMenuAction className="top-3 right-2 data-panel-open:[&>svg]:rotate-90" />
          }
        >
          <ChevronRight className="transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub aria-label="Masters" className="mt-1">
            {MASTERS_GROUPS.map((group) => (
              <li key={group.label} className="mt-2 first:mt-1">
                <p
                  id={groupLabelId(group.label)}
                  className="text-sidebar-foreground/55 px-2 pb-1 text-[0.7rem] font-semibold tracking-wide uppercase"
                >
                  {group.label}
                </p>
                <ul
                  aria-labelledby={groupLabelId(group.label)}
                  className="flex flex-col gap-0.5"
                >
                  {group.sections.map((section) => {
                    const active = current?.href === section.href;
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

function groupLabelId(label: string): string {
  return `masters-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
