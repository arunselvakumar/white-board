import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { EditEquipmentPage } from "@/components/site-work/equipment/equipment-pages";

export const metadata: Metadata = { title: "Edit Equipment" };

export default async function ProjectEditEquipmentRoute({
  params,
}: {
  params: Promise<{ id: string; equipmentId: string }>;
}) {
  const { id, equipmentId } = await params;
  if (!(await viewerCan("masters.equipments", "update")))
    return <ProjectNoAccess what="editing equipment" />;
  return <EditEquipmentPage id={equipmentId} projectId={id} />;
}
