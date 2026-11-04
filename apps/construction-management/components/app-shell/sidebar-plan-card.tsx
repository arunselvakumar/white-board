"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  SidebarMeter,
  SidebarMeterCard,
} from "@repo/ui/components/sidebar-chrome";

import {
  subscriptionQuery,
  type SubscriptionView,
} from "@/src/queries/subscription";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The share of the plan still to run, 0–100: days left over the plan's
 * length from its start to its end.
 */
export function planPercentLeft(
  plan: NonNullable<SubscriptionView["plan"]>,
): number {
  const totalDays =
    (Date.parse(plan.endsAt) - Date.parse(plan.startsAt)) / DAY_MS;
  if (!Number.isFinite(totalDays) || totalDays <= 0) return 0;
  return Math.max(0, Math.min(100, (plan.daysLeft / totalDays) * 100));
}

/**
 * The plan card at the foot of the sidebar (ADR-0049): a ring of the days
 * left, the plan's name, and a link to Your Subscription. A Company with
 * no plan yet sees nothing; so does everyone while the subscription loads
 * or when it cannot, a failed refetch included (the shell never suspends
 * or blocks on it). It refetches hourly, so a tab left open keeps the days
 * left right as they tick down.
 */
export function SidebarPlanCard() {
  const { data, isError } = useQuery({
    ...subscriptionQuery,
    retry: false,
    refetchInterval: DAY_MS / 24,
  });
  // Partial: a story or an old server may answer with something else.
  const view = data as Partial<SubscriptionView> | undefined;
  if (
    isError ||
    view?.status == null ||
    view.status === "none" ||
    view.plan == null
  )
    return null;

  const daysLeft = Math.max(0, view.plan.daysLeft);
  const caption =
    view.status === "active"
      ? `${String(daysLeft)} ${daysLeft === 1 ? "day" : "days"} left`
      : "Plan ended";

  return (
    <SidebarMeterCard
      lead={
        <SidebarMeter
          percent={view.status === "active" ? planPercentLeft(view.plan) : 0}
          label={`${String(daysLeft)}d`}
        />
      }
      title={view.plan.name}
      caption={caption}
    >
      <Link
        href="/app/subscription"
        className="text-sidebar-foreground/80 hover:text-sidebar-foreground mt-2 inline-block text-xs font-medium underline-offset-4 hover:underline"
      >
        {view.canManage === true ? "Manage plan" : "View plan"}
      </Link>
    </SidebarMeterCard>
  );
}
