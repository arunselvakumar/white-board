"use client";

import { Hammer, Truck, UserRoundPlus } from "lucide-react";
import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { PageHeader } from "@/components/app-shell/page-header";

/*
 * Central Payment while it loads (ADR-0047): the real title, the Party
 * dues heading, its tabs and column headers; bars where the figures go.
 */

export const PARTY_TABS = [
  {
    value: "contractor",
    label: "Contractors",
    noun: "Contractor",
    icon: Hammer,
  },
  { value: "supplier", label: "Suppliers", noun: "Supplier", icon: Truck },
  {
    value: "other_party",
    label: "Other Parties",
    noun: "Other Party",
    icon: UserRoundPlus,
  },
] as const;

const WIDE = "hidden py-2 pl-2 text-right sm:table-cell";
const WIDTHS = ["62%", "48%", "70%", "55%", "66%"];

function DuesTableSkeleton() {
  return (
    <div className="w-full min-w-0 overflow-x-auto">
      <table className="w-full table-auto text-sm sm:table-fixed">
        <thead className="text-muted-foreground border-b text-left text-xs">
          <tr>
            <th className="w-full max-w-0 py-2 pr-2 font-medium sm:w-[28%] sm:max-w-none">
              Contractor
            </th>
            <th className={`${WIDE} font-medium`}>Invoiced</th>
            <th className={`${WIDE} font-medium`}>Paid</th>
            <th className="py-2 pl-2 text-right font-medium">Due</th>
            <th className={`${WIDE} font-medium`}>Overdue</th>
            <th className={`${WIDE} font-medium`}>Advance</th>
            <th className="py-2 pl-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {WIDTHS.map((width, row) => (
            <tr key={row}>
              <td className="py-2 pr-2">
                <SkeletonText width={width} />
              </td>
              {[WIDE, WIDE, "py-2 pl-2", WIDE, WIDE, "py-2 pl-2"].map(
                (className, cell) => (
                  <td key={cell} className={className}>
                    <SkeletonText width="4.5rem" className="ml-auto" />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The whole Central Payment page while its summary loads. */
export function CentralPaymentSkeleton() {
  return (
    <div className="w-full min-w-0 p-6">
      <div className="w-full max-w-6xl min-w-0 space-y-8">
        <PageHeader
          title="Central Payment"
          meta={<SkeletonText width="min(26rem, 80vw)" />}
        />
        <section className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Party dues</h2>
            <p className="text-muted-foreground text-sm">
              Due is what is left on bills from the party; Paid counts TDS and
              write-offs; Advance is paid but not yet set against a bill. A
              positive balance is owed to the party.
            </p>
          </div>
          <Tabs defaultValue="contractor">
            <TabsList aria-label="Party type">
              {PARTY_TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} disabled>
                  <item.icon aria-hidden="true" />
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <SkeletonGroup label="Loading Central Payment" className="block pt-3">
            <DuesTableSkeleton />
          </SkeletonGroup>
        </section>
      </div>
    </div>
  );
}

/** Recent central reports: a title and badge, then the meta line. */
export function RecentCentralReportsSkeleton() {
  return (
    <SkeletonGroup label="Loading recent reports">
      <ul className="divide-y rounded-xl border">
        {WIDTHS.slice(0, 3).map((width, row) => (
          <li
            key={row}
            className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <SkeletonText size="base" width={width} />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <SkeletonText width="40%" />
            </div>
            <Skeleton className="h-10 w-28 rounded-md" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}
