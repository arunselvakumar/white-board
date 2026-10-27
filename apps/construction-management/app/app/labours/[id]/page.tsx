import type { Metadata } from "next";

import { EditLabourScreen } from "@/components/labours/labour-form";
import { LabourFormSkeleton } from "@/components/labours/labours-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Labour" };

export default async function EditLabourPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={<LabourFormSkeleton />}>
      <EditLabourScreen id={id} />
    </QuerySuspense>
  );
}
