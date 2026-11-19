import { LockSimpleIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { EmptyState } from "@repo/ui/components/empty-state";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectDashboard } from "@/app/app/projects/[id]/dashboard/_components/project-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

/** The Project Dashboard, behind the Dashboard menu's Read flag. */
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
        <EmptyState
          className="bg-card max-w-4xl border"
          icon={LockSimpleIcon}
          tone="neutral"
          orbit={false}
          title="No access to the Dashboard"
          description="Ask the Owner to give you the Dashboard permission in your Permission Matrix."
        />
      </div>
    );
  return <ProjectDashboard projectId={id} />;
}
