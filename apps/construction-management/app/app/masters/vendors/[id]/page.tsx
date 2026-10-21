import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { EditVendorScreen } from "@/components/vendors/vendor-form";
import { VendorFormSkeleton } from "@/components/vendors/vendors-skeletons";

export const metadata: Metadata = { title: "Edit Vendor" };

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={<VendorFormSkeleton />}>
      <EditVendorScreen id={id} />
    </QuerySuspense>
  );
}
