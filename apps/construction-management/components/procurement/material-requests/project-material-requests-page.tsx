"use client";

import { projectRequestHref } from "@/components/procurement/stores/central-store-parts";

import { MaterialRequestsList } from "./material-requests-list";

/** A Project's Materials → Material Requests tab (CM-508). */
export function ProjectMaterialRequestsPage({
  projectId,
  canCreate,
}: {
  projectId: string;
  canCreate: boolean;
}) {
  return (
    <div className="w-full max-w-5xl space-y-4">
      <h2 className="font-semibold">Material Requests</h2>
      <MaterialRequestsList
        projectId={projectId}
        hrefFor={(request) => projectRequestHref.detail(projectId, request.id)}
        createHref={canCreate ? projectRequestHref.create(projectId) : null}
      />
    </div>
  );
}
