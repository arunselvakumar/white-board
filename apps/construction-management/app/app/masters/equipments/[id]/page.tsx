import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { MastersEquipmentDetailPage } from "@/components/site-work/equipment/equipment-pages";

export const metadata: Metadata = { title: "Equipment" };

/** One machine: details, Transfer Report and maintenance log (CM-603, CM-605). */
export default async function EquipmentRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("masters.equipments", "read")))
    return <ProjectNoAccess what="Equipments" />;
  return <MastersEquipmentDetailPage id={id} />;
}
