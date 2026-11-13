import type { Metadata } from "next";

import { NewProjectSkeleton } from "@/app/app/projects/_components/projects-skeletons";
import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { PROJECT_CLIENT_NAME_MAX } from "@/src/projects/domain/project-contract-rules";

import { NewProjectScreen } from "@/app/app/projects/_components/project-form";

export const metadata: Metadata = { title: "New Project" };

/**
 * `?clientName=` starts the form with that client name (Create Project
 * from a Won Prospect Company), trimmed and cut to what the field takes.
 */
function clientNameOf(raw: string | string[] | undefined): string | undefined {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  return value === "" ? undefined : value.slice(0, PROJECT_CLIENT_NAME_MAX);
}

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientName?: string | string[] }>;
}) {
  const [{ clientName }, financial] = await Promise.all([
    searchParams,
    // From the session, not the Projects list, so a member with Projects
    // create but no read can open the form too.
    viewerCan("projects.project", "financial"),
  ]);
  return (
    <QuerySuspense fallback={<NewProjectSkeleton />}>
      <NewProjectScreen
        clientName={clientNameOf(clientName)}
        financial={financial}
      />
    </QuerySuspense>
  );
}
