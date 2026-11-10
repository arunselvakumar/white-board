import type { Metadata } from "next";

import { NewVendorScreen } from "@/components/vendors/vendor-form";

export const metadata: Metadata = { title: "Add Vendor" };

export default function NewVendorPage() {
  return <NewVendorScreen />;
}
