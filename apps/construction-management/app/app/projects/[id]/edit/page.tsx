import type { Metadata } from "next";

import { EditProjectSkeleton } from "@/components/projects/projects-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

import { ProjectEditScreen } from "@/components/projects/project-overview";

export const metadata: Metadata = { title: "Edit Project" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense fallback={<EditProjectSkeleton />}>
      <ProjectEditScreen id={id} />
    </QuerySuspense>
  );
}
