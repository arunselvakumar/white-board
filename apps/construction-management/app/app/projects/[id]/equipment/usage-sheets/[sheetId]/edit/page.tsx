import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { EditEquipmentSheetPage } from "@/app/app/projects/[id]/equipment/usage-sheets/_components/equipment-sheet-form-pages";
import { EquipmentSheetFormSkeleton } from "@/app/app/_components/site-work/site-work-skeletons";
import { EditDocumentSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";

export const metadata: Metadata = { title: "Edit usage sheet" };

export default async function EditEquipmentSheetRoute({
  params,
}: {
  params: Promise<{ id: string; sheetId: string }>;
}) {
  const { id, sheetId } = await params;
  if (
    !(await viewerCan("site_work.equipment_usage", "update", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="editing Equipment Usage sheets" />;
  return (
    <QuerySuspense
      fallback={
        <EditDocumentSkeleton>
          <EquipmentSheetFormSkeleton />
        </EditDocumentSkeleton>
      }
    >
      <EditEquipmentSheetPage projectId={id} id={sheetId} />
    </QuerySuspense>
  );
}
