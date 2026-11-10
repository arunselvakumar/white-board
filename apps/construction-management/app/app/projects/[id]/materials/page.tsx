import { redirect } from "next/navigation";

import { materialsPath } from "@/app/app/_components/procurement/materials-hub/materials-tabs";

/** The Materials module opens on Current Inventory. */
export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(materialsPath(id, "inventory"));
}
