import type { Metadata } from "next";

import { EditMaterialScreen } from "@/components/masters/material-form";
import { MaterialFormSkeleton } from "@/components/masters/masters-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Material" };

export default async function EditMaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={<MaterialFormSkeleton />}>
      <EditMaterialScreen id={id} />
    </QuerySuspense>
  );
}
