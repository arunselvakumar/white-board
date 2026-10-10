"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { materialRequestQuery } from "@/src/queries/material-requests";

import { MaterialRequestForm } from "./material-request-form";

/** Edit Material Request: the form over the request as loaded. */
export function EditMaterialRequestPage({
  projectId,
  requestId,
}: {
  projectId: string;
  requestId: string;
}) {
  const { data } = useSuspenseQuery(materialRequestQuery(requestId));
  return (
    <MaterialRequestForm
      key={data.updatedAt}
      projectId={projectId}
      request={data}
    />
  );
}
