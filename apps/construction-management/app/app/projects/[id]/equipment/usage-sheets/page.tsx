import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { EquipmentSheetsPage } from "@/app/app/projects/[id]/equipment/usage-sheets/_components/equipment-sheets-page";

export const metadata: Metadata = { title: "Equipment Usage sheets" };

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
