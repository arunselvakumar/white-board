import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { EditVendorScreen } from "@/app/app/staff/vendors/_components/vendor-form";
import { VendorFormSkeleton } from "@/app/app/staff/vendors/_components/vendors-skeletons";

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
