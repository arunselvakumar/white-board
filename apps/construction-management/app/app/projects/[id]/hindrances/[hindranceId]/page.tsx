import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { HindranceDetail } from "@/components/site-work/hindrances/hindrance-detail";

export const metadata: Metadata = { title: "Hindrance" };

/** One hindrance (CM-607). */
export default async function HindranceRoute({
  params,
}: {
  params: Promise<{ id: string; hindranceId: string }>;
}) {
  const { id, hindranceId } = await params;
  if (!(await viewerCan("site_work.hindrances", "read", { projectId: id })))
    return <ProjectNoAccess what="the Hindrance register" />;
  return <HindranceDetail projectId={id} id={hindranceId} />;
}
