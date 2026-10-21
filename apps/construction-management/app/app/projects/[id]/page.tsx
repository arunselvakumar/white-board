import type { Metadata } from "next";

import { ProjectLanding } from "@/components/projects/project-landing";

export const metadata: Metadata = { title: "Project" };

/** Opening a Project lands on the first module in its menu (#99). */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectLanding id={id} />;
}
