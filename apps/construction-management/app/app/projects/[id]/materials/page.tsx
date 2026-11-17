import { redirect } from "next/navigation";

import { pageHref } from "@/lib/page-href";

/** The Materials module opens on Current Inventory. */
export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(pageHref("/app/projects/[id]/materials/inventory", { id }));
}
