import type { Metadata } from "next";

import { BillingAddressesManager } from "@/components/settings/billing-addresses-manager";

export const metadata: Metadata = { title: "Billing addresses" };

export default function BillingAddressesPage() {
  return <BillingAddressesManager />;
}
