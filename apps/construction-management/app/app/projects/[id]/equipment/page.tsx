import { redirect } from "next/navigation";

import { pageHref } from "@/lib/page-href";

/** The Equipment module opens on its usage sheets. */
export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(pageHref("/app/projects/[id]/equipment/usage-sheets", { id }));
}
