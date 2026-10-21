import type { Metadata } from "next";

import { SubscriptionOverview } from "@/components/subscription/subscription-overview";
import { SubscriptionOverviewSkeleton } from "@/components/subscription/subscription-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Your Subscription" };

export default function SubscriptionPage() {
  return (
    <QuerySuspense fallback={<SubscriptionOverviewSkeleton />}>
      <SubscriptionOverview />
    </QuerySuspense>
  );
}
