import type { Metadata } from "next";

import { BillingAddressesManager } from "@/app/app/settings/billing-addresses/_components/billing-addresses-manager";
import { BillingAddressesSkeleton } from "@/app/app/settings/_components/settings-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Billing addresses" };

export default function BillingAddressesPage() {
  return (
    <QuerySuspense fallback={<BillingAddressesSkeleton />}>
      <BillingAddressesManager />
    </QuerySuspense>
  );
}
