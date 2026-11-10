import type { Metadata } from "next";

import { GrnFieldsForm } from "@/app/app/settings/grn-fields/_components/grn-fields-form";
import { GrnFieldsSkeleton } from "@/app/app/settings/_components/settings-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "GRN fields" };

export default function GrnFieldsPage() {
  return (
    <QuerySuspense fallback={<GrnFieldsSkeleton />}>
      <GrnFieldsForm />
    </QuerySuspense>
  );
}
