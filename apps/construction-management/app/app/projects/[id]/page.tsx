import type { Metadata } from "next";

import { ProjectLanding } from "@/components/projects/project-landing";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Project" };

/**
 * Opening a Project lands on the first module in its menu (#99); nothing
 * is drawn while the menu is read, so no skeleton but the module's shows.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={null}>
      <ProjectLanding id={id} />
    </QuerySuspense>
  );
}
