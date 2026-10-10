import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectDashboard } from "@/components/projects/dashboard/project-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

/** The Project Dashboard (CM-412), behind the Dashboard menu's Read flag. */
export default async function ProjectDashboardRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canRead = await viewerCan("reporting.project_dashboard", "read", {
    projectId: id,
  });
  if (!canRead)
    return (
      <div className="w-full p-6">
        <Empty className="max-w-4xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutDashboard />
            </EmptyMedia>
            <EmptyTitle>No access to the Dashboard</EmptyTitle>
            <EmptyDescription>
              Ask the Owner to give you the Dashboard permission in your
              Permission Matrix.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  return <ProjectDashboard projectId={id} />;
}
