import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { NewEquipmentSheetPage } from "@/app/app/projects/[id]/equipment/usage-sheets/_components/equipment-sheet-form-pages";
import {
  EquipmentSheetFormSkeleton,
  TitledFormSkeleton,
} from "@/app/app/_components/site-work/site-work-skeletons";

export const metadata: Metadata = { title: "Add usage sheet" };

/** Add an Equipment Usage sheet; `?from=<id>` duplicates one (ADR CM-0016 §12). */
export default async function NewEquipmentSheetRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  if (
    !(await viewerCan("site_work.equipment_usage", "create", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="new Equipment Usage sheets" />;
  const fromId =
    typeof from === "string" && /^[0-9a-f-]{36}$/i.test(from) ? from : null;
  return (
    <QuerySuspense
      fallback={
        <TitledFormSkeleton
          title={fromId == null ? "Add usage sheet" : "Duplicate usage sheet"}
        >
          <EquipmentSheetFormSkeleton />
        </TitledFormSkeleton>
      }
    >
      <NewEquipmentSheetPage projectId={id} fromId={fromId} />
    </QuerySuspense>
  );
}
