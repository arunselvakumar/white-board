import type { Metadata } from "next";

import { VendorsPage } from "@/app/app/staff/vendors/_components/vendors-page";

export const metadata: Metadata = { title: "Vendors" };

export default function VendorsMasterPage() {
  return <VendorsPage />;
}
