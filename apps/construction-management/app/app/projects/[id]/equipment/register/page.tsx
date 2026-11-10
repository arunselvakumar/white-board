import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { ProjectEquipmentList } from "@/components/site-work/equipment/equipment-list";

export const metadata: Metadata = { title: "Equipment" };

/** The equipment at this Project now. */
export default async function ProjectEquipmentRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !(await viewerCan("site_work.equipment_usage", "read", {
      projectId: id,
    })) &&
    !(await viewerCan("masters.equipments", "read"))
  )
    return <ProjectNoAccess what="Equipment" />;
  return <ProjectEquipmentList projectId={id} />;
}
