import type { Metadata } from "next";

import { ProjectOverview } from "@/components/projects/project-overview";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectOverview id={id} />;
}
