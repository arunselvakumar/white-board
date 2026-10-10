"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

import { HRMS_PATH } from "@/lib/hrms-nav";
import {
  hrmsDashboardQuery,
  type HrmsDashboardModel,
} from "@/src/queries/hrms-dashboard";

import { LIVE_STATE_LABELS } from "./attendance-parts";

type Stat = { label: string; value: string };

/** Today's headline numbers: the team's for View All, else the caller's own. */
function headline(data: HrmsDashboardModel): Stat[] {
  const stats: Stat[] = [];
  if (data.team != null)
    stats.push(
      {
        label: "Present today",
        value: `${String(data.team.presentToday)} of ${String(data.team.employees)}`,
      },
      { label: "On leave", value: String(data.team.onLeave) },
    );
  else if (data.me?.today != null)
    stats.push({
      label: "Your day",
      value: LIVE_STATE_LABELS[data.me.today.state],
    });
  if (data.approvals != null)
    stats.push({
      label: "Pending approvals",
      value: String(data.approvals.total),
    });
  return stats;
}

/**
 * The Workspace page's HRMS tile (CM-319): what HRMS is, and today's
 * headline numbers for a Team Member with HRMS access (the HRMS Dashboard
 * read). Without access, or while loading, it is the plain link.
 */
export function HrmsWorkspaceTile() {
  const { data } = useQuery({ ...hrmsDashboardQuery, retry: false });
  const stats = data == null ? [] : headline(data);
  return (
    <Item
      variant="outline"
      className="w-full"
      render={<Link href={HRMS_PATH} />}
    >
      <ItemMedia variant="icon">
        <Users />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>HRMS</ItemTitle>
        <ItemDescription>
          Your staff&apos;s attendance with geo-fenced check-in, leave, shifts,
          holidays and monthly salary.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ChevronRight className="text-muted-foreground size-4" />
      </ItemActions>
      {stats.length === 0 ? null : (
        <ItemFooter>
          <dl
            aria-label="HRMS today"
            className="grid w-full grid-cols-3 gap-2 border-t pt-3"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="min-w-0">
                <dt className="text-muted-foreground truncate text-xs">
                  {stat.label}
                </dt>
                <dd className="truncate text-sm font-semibold tabular-nums">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </ItemFooter>
      )}
    </Item>
  );
}
