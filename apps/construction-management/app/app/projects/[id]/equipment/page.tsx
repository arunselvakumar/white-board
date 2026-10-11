import { redirect } from "next/navigation";

import { equipmentModulePath } from "@/components/site-work/equipment/equipment-tabs";

/** The Equipment module opens on its usage sheets. */
export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(equipmentModulePath(id, "usage-sheets"));
}
