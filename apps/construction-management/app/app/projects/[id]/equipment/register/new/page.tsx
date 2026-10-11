import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { ProjectNewEquipmentPage } from "@/components/site-work/equipment/equipment-pages";

export const metadata: Metadata = { title: "Add equipment" };

export default async function ProjectNewEquipmentRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !(await viewerCan("site_work.equipment_usage", "create", {
      projectId: id,
    })) &&
    !(await viewerCan("masters.equipments", "create"))
  )
    return <ProjectNoAccess what="adding equipment" />;
  return <ProjectNewEquipmentPage projectId={id} />;
}
