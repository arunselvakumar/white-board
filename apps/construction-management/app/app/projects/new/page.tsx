import type { Metadata } from "next";

import { NewProjectSkeleton } from "@/components/projects/projects-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

import { NewProjectScreen } from "@/components/projects/project-form";

export const metadata: Metadata = { title: "New Project" };

export default function NewProjectPage() {
  return (
    <QuerySuspense fallback={<NewProjectSkeleton />}>
      <NewProjectScreen />
    </QuerySuspense>
  );
}
