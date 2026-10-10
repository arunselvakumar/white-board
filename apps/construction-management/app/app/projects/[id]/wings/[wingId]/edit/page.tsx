import type { Metadata } from "next";

import { EditWingScreen } from "@/components/projects/structure/edit-wing-screen";
import { StructureNoAccess } from "@/components/projects/structure/structure-parts";

import { structureAccess } from "../../structure-access";

export const metadata: Metadata = { title: "Edit Wing" };

/** Edit Wing: the floor and unit editor on the saved Wing (CM-402). */
export default async function EditWingRoute({
  params,
}: {
  params: Promise<{ id: string; wingId: string }>;
}) {
  const { id, wingId } = await params;
  const access = await structureAccess("projects.wings", id);
  if (!access.read || !access.update)
    return <StructureNoAccess what="editing Wings" />;
  return <EditWingScreen projectId={id} wingId={wingId} />;
}
