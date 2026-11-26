"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  AlarmClock,
  CalendarDays,
  IndianRupee,
  Users,
  Wallet,
} from "lucide-react";
import { MetricCard } from "@repo/ui/components/metric-card";

import { formatPaiseAsRupees } from "@/lib/money";
import { feeSummaryQueryOptions } from "@/src/queries/preschool/fees";

/** Collected today and this month, dues, overdue and Children with dues. */
export function FeeSummaryTiles({ centreId }: { centreId: string }) {
  const { data } = useSuspenseQuery(feeSummaryQueryOptions(centreId));
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <MetricCard
        label="Collected today"
        icon={IndianRupee}
        value={formatPaiseAsRupees(data.collectedTodayPaise)}
      />
      <MetricCard
        label="Collected this month"
        icon={CalendarDays}
        value={formatPaiseAsRupees(data.collectedThisMonthPaise)}
      />
      <MetricCard
        label="Due"
        icon={Wallet}
        value={formatPaiseAsRupees(data.duePaise)}
      />
      <MetricCard
        label="Overdue"
        icon={AlarmClock}
        value={formatPaiseAsRupees(data.overduePaise)}
        {...(data.overduePaise > 0
          ? { badge: "Follow up", badgeTone: "warning" as const }
          : {})}
      />
      <MetricCard
        label="Children with dues"
        icon={Users}
        value={data.childrenWithDues}
      />
    </div>
  );
}
