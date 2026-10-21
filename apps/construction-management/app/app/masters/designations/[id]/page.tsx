import type { Metadata } from "next";

import { EditDesignationScreen } from "@/components/designations/designation-form";
import { DesignationFormSkeleton } from "@/components/designations/designations-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Designation" };

export default async function EditDesignationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={<DesignationFormSkeleton />}>
      <EditDesignationScreen id={id} />
    </QuerySuspense>
  );
}
