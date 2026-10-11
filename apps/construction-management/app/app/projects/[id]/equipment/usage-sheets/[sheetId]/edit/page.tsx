import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { EditEquipmentSheetPage } from "@/components/site-work/equipment-sheets/equipment-sheet-form-pages";

export const metadata: Metadata = { title: "Edit usage sheet" };

/** Edit an Equipment Usage sheet (CM-604). */
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
    <QuerySuspense>
      <EditEquipmentSheetPage projectId={id} id={sheetId} />
    </QuerySuspense>
  );
}
