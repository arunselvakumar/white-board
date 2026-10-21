import type { Metadata } from "next";

import { GrnFieldsForm } from "@/components/settings/grn-fields-form";
import { GrnFieldsSkeleton } from "@/components/settings/settings-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "GRN fields" };

export default function GrnFieldsPage() {
  return (
    <QuerySuspense fallback={<GrnFieldsSkeleton />}>
      <GrnFieldsForm />
    </QuerySuspense>
  );
}
