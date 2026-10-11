import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { EquipmentSheetsPage } from "@/components/site-work/equipment-sheets/equipment-sheets-page";

export const metadata: Metadata = { title: "Equipment Usage sheets" };

/** The Project's Equipment Usage sheets (CM-604). */
export default async function EquipmentUsageSheetsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !(await viewerCan("site_work.equipment_usage", "read", { projectId: id }))
  )
    return <ProjectNoAccess what="Equipment Usage sheets" />;
  return <EquipmentSheetsPage projectId={id} />;
}
