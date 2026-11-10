import type { Metadata } from "next";

import { NewMaterialScreen } from "@/app/app/masters/materials/_components/material-form";
import { MaterialFormSkeleton } from "@/app/app/_components/masters/masters-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Add Material" };

export default function NewMaterialPage() {
  return (
    <QuerySuspense fallback={<MaterialFormSkeleton title="Add Material" />}>
      <NewMaterialScreen />
    </QuerySuspense>
  );
}
