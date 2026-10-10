import type { Metadata } from "next";

import { LocationsPage } from "@/components/projects/structure/locations-page";
import { StructureNoAccess } from "@/components/projects/structure/structure-parts";

import { structureAccess } from "../wings/structure-access";

export const metadata: Metadata = { title: "Locations" };

/** The Project's Locations (CM-405). */
export default async function ProjectLocationsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await structureAccess("projects.locations", id);
  if (!access.read) return <StructureNoAccess what="Locations" />;
  return <LocationsPage projectId={id} access={access} />;
}
