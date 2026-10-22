import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { MeasurementsList } from "@/components/contracts/measurements/measurements-list";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Measurements" };

/** The Project's Measurement Book (CM-1105, ADR CM-0023 §6). */
export default async function MeasurementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("contracts.measurements", "read", { projectId: id })))
    return <ProjectNoAccess what="Measurements" />;
  const canCreate = await viewerCan("contracts.measurements", "create", {
    projectId: id,
  });
  return <MeasurementsList projectId={id} canCreate={canCreate} />;
}
