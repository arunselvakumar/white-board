import type { Metadata } from "next";

import { SubscriptionOverview } from "@/components/subscription/subscription-overview";

export const metadata: Metadata = { title: "Your Subscription" };

export default function SubscriptionPage() {
  return <SubscriptionOverview />;
}
