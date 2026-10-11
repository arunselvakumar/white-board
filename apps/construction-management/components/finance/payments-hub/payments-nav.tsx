"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/ui/lib/utils";

import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";

import { PAYMENTS_TABS, paymentsPath } from "./payments-tabs";

/**
 * The Payments module's tabs (M7). Until the viewer's access loads every
 * tab shows; then only those whose menu they may read.
 */
export function PaymentsNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const access = useQuery(financeAccessQuery(projectId)).data;
  const tabs = PAYMENTS_TABS.filter(
    (tab) =>
      access == null ||
      tab.menus.some((menu) => canInFinance(access, menu, "read")),
  );
  return (
    <nav aria-label="Payments" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-1">
        {tabs.map((tab) => {
          const href = paymentsPath(projectId, tab.segment);
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
