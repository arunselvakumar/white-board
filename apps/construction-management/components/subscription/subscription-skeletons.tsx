import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";

import { PageHeader } from "@/components/app-shell/page-header";
import { PageHeaderSkeleton } from "@/components/app-shell/page-header-skeleton";

import { GRANT_LABELS } from "./subscription-text";

/** Your Subscription and checkout while they load (ADR-0047). */

export function SubscriptionOverviewSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          title="Your Subscription"
          meta={<SkeletonText width="6rem" />}
        />
        <SkeletonGroup
          label="Loading your Subscription"
          className="block space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SkeletonText size="base" width="7rem" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </CardTitle>
              <SkeletonText width="16rem" />
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Usage</CardTitle>
              <CardDescription>
                <SkeletonText width="18rem" />
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {Object.values(GRANT_LABELS).map((label) => (
                <div key={label} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    <SkeletonText width="3.5rem" />
                  </div>
                  <Skeleton className="h-1 w-full rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </SkeletonGroup>
      </div>
    </div>
  );
}

/** Checkout: the title depends on the plan, so it is a bar; then the plan step. */
export function CheckoutSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeaderSkeleton
          back={{ label: "Your Subscription", href: "/app/subscription" }}
        />
        <SkeletonGroup label="Loading plans" className="block space-y-6">
          <div className="space-y-3">
            <SkeletonText size="xs" width="9rem" />
            <div className="flex gap-1.5">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-1 flex-1 rounded-full" />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <SkeletonText size="lg" width="9rem" />
            <div className="grid gap-3 sm:grid-cols-2">
              {["7rem", "5.5rem", "8rem", "6rem"].map((width) => (
                <div
                  key={width}
                  className="flex items-start gap-3 rounded-xl border p-4"
                >
                  <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <SkeletonText size="base" width={width} />
                    <SkeletonText width="80%" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SkeletonGroup>
      </div>
    </div>
  );
}
