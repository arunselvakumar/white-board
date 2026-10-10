import type { Metadata } from "next";

import { AddWingScreen } from "@/components/projects/structure/add-wing-screen";
import { StructureNoAccess } from "@/components/projects/structure/structure-parts";

import { structureAccess } from "../structure-access";

export const metadata: Metadata = { title: "Add Wing" };

/** Add Wing → Continue to Units → Save (CM-402). */
export default async function AddWingRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ phase?: string | string[] }>;
}) {
  const { id } = await params;
  const { phase } = await searchParams;
  const access = await structureAccess("projects.wings", id);
  if (!access.read || !access.create)
    return <StructureNoAccess what="adding Wings" />;
  return (
    <AddWingScreen
      projectId={id}
      phaseId={typeof phase === "string" ? phase : undefined}
    />
  );
}
