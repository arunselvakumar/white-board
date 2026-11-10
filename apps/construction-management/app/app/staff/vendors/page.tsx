import type { Metadata } from "next";

import { VendorsPage } from "@/components/vendors/vendors-page";

export const metadata: Metadata = { title: "Vendors" };

export default function VendorsMasterPage() {
  return <VendorsPage />;
}
