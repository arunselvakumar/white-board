import type { Metadata } from "next";

import { ProjectEditScreen } from "@/components/projects/project-overview";

export const metadata: Metadata = { title: "Edit Project" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectEditScreen id={id} />;
}
