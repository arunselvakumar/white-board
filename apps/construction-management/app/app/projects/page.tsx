import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { QuerySuspense } from "@/components/query-suspense";
import { ProjectsHome } from "@/app/app/projects/_components/projects-home";
import { ProjectsHomeSkeleton } from "@/app/app/projects/_components/projects-skeletons";
import { APP_HOME } from "@/lib/safe-redirect";

import { viewerHomePath } from "../_lib/viewer-home";

export const metadata: Metadata = { title: "Projects" };

/** The Projects home; an HRMS Team Member has no Projects and lands in HRMS. */
export default async function ProjectsPage() {
  const home = await viewerHomePath();
  if (home !== APP_HOME) redirect(home);
  return (
    <QuerySuspense fallback={<ProjectsHomeSkeleton />}>
      <ProjectsHome />
    </QuerySuspense>
  );
}
