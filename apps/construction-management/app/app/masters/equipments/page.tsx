import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { EquipmentRegister } from "@/app/app/_components/site-work/equipment/equipment-list";

export const metadata: Metadata = { title: "Equipments" };

/** The Company's Equipment register. */
export default async function EquipmentsPage() {
  if (!(await viewerCan("masters.equipments", "read")))
    return <ProjectNoAccess what="Equipments" />;
  return <EquipmentRegister />;
}
