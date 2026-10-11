import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { EquipmentRegister } from "@/components/site-work/equipment/equipment-list";

export const metadata: Metadata = { title: "Equipments" };

/** Masters → Equipments: the Company's Equipment register (CM-603). */
export default async function EquipmentsPage() {
  if (!(await viewerCan("masters.equipments", "read")))
    return <ProjectNoAccess what="Equipments" />;
  return <EquipmentRegister />;
}
