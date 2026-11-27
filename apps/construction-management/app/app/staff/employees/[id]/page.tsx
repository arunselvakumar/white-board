import type { Metadata } from "next";

import { LabourPage } from "@/app/app/staff/labours/[id]/_components/labour-page";
import { LabourFormSkeleton } from "@/app/app/staff/labours/_components/labours-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Labour" };

export default async function LabourRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={<LabourFormSkeleton />}>
      <LabourPage id={id} />
    </QuerySuspense>
  );
}
