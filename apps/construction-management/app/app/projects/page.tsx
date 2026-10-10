import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProjectsHome } from "@/components/projects/projects-home";
import { APP_HOME } from "@/lib/safe-redirect";

import { viewerHomePath } from "../_lib/viewer-home";

export const metadata: Metadata = { title: "Projects" };

/** The Projects home; an HRMS Team Member has no Projects and lands in HRMS (CM-318). */
export default async function ProjectsPage() {
  const home = await viewerHomePath();
  if (home !== APP_HOME) redirect(home);
  return <ProjectsHome />;
}
