"use client";

import Link from "next/link";
import {
  SidebarMeter,
  SidebarMeterCard,
} from "@repo/ui/components/sidebar-chrome";

import { useSidebarDashboard } from "./use-sidebar-dashboard";

/**
 * The Owner's Today card above the footer rows: how full today's Batches
 * are, from the Owner Dashboard. Nothing until the Dashboard has loaded.
 */
export function SidebarTodayCard() {
  const dashboard = useSidebarDashboard();
  if (dashboard == null) return null;

  const batches = dashboard.todayBatches;
  const enrolled = batches.reduce((sum, batch) => sum + batch.enrolledCount, 0);
  const capacity = batches.reduce((sum, batch) => sum + batch.capacity, 0);
  const percent = capacity > 0 ? (enrolled / capacity) * 100 : 0;

  // The ring and the figure inside it both say how full today's seats are;
  // the Batch count sits in the caption.
  return (
    <SidebarMeterCard
      lead={
        <SidebarMeter percent={percent} label={`${Math.round(percent)}%`} />
      }
      title="Today's Batches"
      caption={
        batches.length === 0
          ? "No Batches today"
          : `${batches.length} ${batches.length === 1 ? "Batch" : "Batches"} · ${enrolled} of ${capacity} seats`
      }
    >
      <Link
        href="/calendar"
        className="text-sidebar-ring hover:text-sidebar-foreground focus-visible:ring-sidebar-ring mt-2.5 inline-flex rounded-sm text-xs font-medium outline-none focus-visible:ring-2"
      >
        Open Calendar
      </Link>
    </SidebarMeterCard>
  );
}
