import type { Metadata } from "next";

import { BillingAddressesManager } from "@/components/settings/billing-addresses-manager";
import { BillingAddressesSkeleton } from "@/components/settings/settings-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Billing addresses" };

export default function BillingAddressesPage() {
  return (
    <QuerySuspense fallback={<BillingAddressesSkeleton />}>
      <BillingAddressesManager />
    </QuerySuspense>
  );
}
