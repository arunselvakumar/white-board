"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/ui/lib/utils";

import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";

import { MATERIALS_TABS, materialsPath } from "./materials-tabs";

/**
 * The Materials module's tabs (M5). Until the viewer's access loads every
 * tab shows; then only those whose menu they may read.
 */
export function MaterialsNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const access = useQuery(procurementAccessQuery(projectId)).data;
  const tabs = MATERIALS_TABS.filter(
    (tab) => access == null || canIn(access, tab.menu, "read"),
  );
  return (
    <nav aria-label="Materials" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-1">
        {tabs.map((tab) => {
          const href = materialsPath(projectId, tab.segment);
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
