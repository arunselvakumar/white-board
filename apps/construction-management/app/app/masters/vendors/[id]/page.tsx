import type { Metadata } from "next";

import { EditVendorScreen } from "@/components/vendors/vendor-form";

export const metadata: Metadata = { title: "Edit Vendor" };

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditVendorScreen id={id} />;
}
