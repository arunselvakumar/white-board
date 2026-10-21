import type { Metadata } from "next";
import { Suspense } from "react";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { BoqPage as BoqScreen } from "@/components/contracts/boq/boq-page";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "BOQ" };

/** The Project's BOQ, its Variations and deviations (CM-1103, ADR CM-0023 §4). */
export default async function BoqPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("contracts.boq", "read", { projectId: id })))
    return <ProjectNoAccess what="the BOQ" />;
  // The page reads `?tab=` (a notification's Variations link).
  return (
    <Suspense>
      <BoqScreen projectId={id} />
    </Suspense>
  );
}
