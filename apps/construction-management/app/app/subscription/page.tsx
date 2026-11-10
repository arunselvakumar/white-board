import type { Metadata } from "next";

import { SubscriptionOverview } from "@/app/app/subscription/_components/subscription-overview";
import { SubscriptionOverviewSkeleton } from "@/app/app/subscription/_components/subscription-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Your Subscription" };

export default function SubscriptionPage() {
  return (
    <QuerySuspense fallback={<SubscriptionOverviewSkeleton />}>
      <SubscriptionOverview />
    </QuerySuspense>
  );
}
