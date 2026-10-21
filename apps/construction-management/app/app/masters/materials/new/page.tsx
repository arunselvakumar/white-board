import type { Metadata } from "next";

import { NewMaterialScreen } from "@/components/masters/material-form";
import { MaterialFormSkeleton } from "@/components/masters/masters-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Add Material" };

export default function NewMaterialPage() {
  return (
    <QuerySuspense fallback={<MaterialFormSkeleton title="Add Material" />}>
      <NewMaterialScreen />
    </QuerySuspense>
  );
}
