import type { Metadata } from "next";

import { NewProjectSkeleton } from "@/app/app/projects/_components/projects-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

import { NewProjectScreen } from "@/app/app/projects/_components/project-form";

export const metadata: Metadata = { title: "New Project" };

export default function NewProjectPage() {
  return (
    <QuerySuspense fallback={<NewProjectSkeleton />}>
      <NewProjectScreen />
    </QuerySuspense>
  );
}
