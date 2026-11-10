"use client";

import { Suspense } from "react";
import { projectRequestHref } from "@/app/app/_components/procurement/stores/central-store-parts";

import { MaterialRequestsList } from "@/app/app/_components/procurement/material-requests/material-requests-list";
import { RequestRowsSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";

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
      <Suspense
        fallback={<RequestRowsSkeleton label="Loading Material Requests" />}
      >
        <MaterialRequestsList
          projectId={projectId}
          hrefFor={(request) =>
            projectRequestHref.detail(projectId, request.id)
          }
          createHref={canCreate ? projectRequestHref.create(projectId) : null}
        />
      </Suspense>
    </div>
  );
}
