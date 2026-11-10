import type { Metadata } from "next";

import { EditMaterialScreen } from "@/app/app/masters/materials/_components/material-form";
import { MaterialFormSkeleton } from "@/app/app/_components/masters/masters-skeletons";
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
