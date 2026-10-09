"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import {
  subscriptionQuery,
  type SubscriptionView,
} from "@/src/queries/subscription";

/** Days left on a paid plan from which the banner reminds the Owner. */
const ENDING_SOON_DAYS = 7;

type Banner = {
  message: string;
  action: { label: string; href: string };
  tone: string;
};

function bannerFor(view: SubscriptionView): Banner | null {
  const daysLeft = view.plan?.daysLeft ?? 0;
  const days = `${String(daysLeft)} ${daysLeft === 1 ? "day" : "days"} left`;
  switch (view.status) {
    case "none":
      return null;
    case "expired":
      return {
        message:
          "Your plan has ended. Your data is safe and read-only; export is still available.",
        action: {
          label: "Choose a plan",
          href: "/app/subscription/checkout?kind=new",
        },
        tone: "bg-destructive/10",
      };
    case "active":
      return daysLeft <= ENDING_SOON_DAYS
        ? {
            message: `Your plan ends soon: ${days}`,
            action: {
              label: "Extend",
              href: "/app/subscription/checkout?kind=extend",
            },
            tone: "bg-primary/10",
          }
        : null;
  }
}

/**
 * The plan banner under the shell header (CM-118): a plan about to end, or
 * an ended plan (read-only, export still open). A Company with no plan yet
 * sees nothing. It never blocks the page: while loading or on error it
 * shows nothing.
 */
export function PlanBanner() {
  const { data } = useQuery({ ...subscriptionQuery, retry: false });
  const view = data as Partial<SubscriptionView> | undefined;
  if (view?.status == null || data == null) return null;
  const banner = bannerFor(data);
  if (banner == null) return null;

  return (
    <div
      role="status"
      className={`${banner.tone} text-foreground flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-sm print:hidden`}
    >
      <span>{banner.message}</span>
      {data.canManage ? (
        <>
          <span aria-hidden="true">—</span>
          <Link
            href={banner.action.href}
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            {banner.action.label}
          </Link>
        </>
      ) : data.status === "expired" ? (
        <span>Ask the Owner to choose a plan.</span>
      ) : null}
      <Link
        href="/app/subscription"
        className="text-muted-foreground ml-auto underline-offset-4 hover:underline"
      >
        Your Subscription
      </Link>
    </div>
  );
}
