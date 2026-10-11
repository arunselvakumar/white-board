import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { NewEquipmentPage } from "@/components/site-work/equipment/equipment-pages";

export const metadata: Metadata = { title: "Add Equipment" };

export default async function NewEquipmentRoute() {
  if (!(await viewerCan("masters.equipments", "create")))
    return <ProjectNoAccess what="adding equipment" />;
  return <NewEquipmentPage />;
}
