"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/ui/lib/utils";

import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";

import { EQUIPMENT_TABS, equipmentModulePath } from "./equipment-tabs";

/**
 * The Equipment module's tabs (M6). Until the viewer's access loads every
 * tab shows; then only those whose menus they may read.
 */
export function EquipmentNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const access = useQuery(siteWorkAccessQuery(projectId)).data;
  const tabs = EQUIPMENT_TABS.filter(
    (tab) =>
      access == null ||
      tab.menus.some((menu) => canInSiteWork(access, menu, "read")),
  );
  return (
    <nav aria-label="Equipment" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-1">
        {tabs.map((tab) => {
          const href = equipmentModulePath(projectId, tab.segment);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.segment}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 inline-flex h-8 items-center rounded-full px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
