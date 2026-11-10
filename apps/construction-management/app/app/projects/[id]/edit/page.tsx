import type { Metadata } from "next";

import { EditProjectSkeleton } from "@/app/app/projects/_components/projects-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

import { ProjectEditScreen } from "@/app/app/projects/[id]/edit/_components/project-edit-screen";

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
