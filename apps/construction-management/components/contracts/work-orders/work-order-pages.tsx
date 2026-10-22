"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import {
  workOrderQuery,
  workOrdersPath,
} from "@/src/queries/contracts-work-orders";

import { WorkOrderForm } from "./work-order-form";
import { workOrderNumber } from "./work-order-format";

/** A new draft Work Order (CM-1104). */
export function WorkOrderNew({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="w-full max-w-4xl">
        <SiteRecordHeader
          back={{ label: "Work Orders", href: workOrdersPath(projectId) }}
          title="New Work Order"
          meta="Saved as a draft; it takes its number when you submit it for approval."
        />
      </div>
      <WorkOrderForm projectId={projectId} workOrder={null} mode="create" />
    </div>
  );
}

/** Edit a draft, or amend an issued Work Order (CM-1104). */
export function WorkOrderChange({
  projectId,
  id,
  mode,
}: {
  projectId: string;
  id: string;
  mode: "edit" | "amend";
}) {
  const { data } = useSuspenseQuery(workOrderQuery(id));
  const number = workOrderNumber(data.number);
  const allowed =
    mode === "edit" ? data.status === "draft" : data.status === "issued";
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="w-full max-w-4xl">
        <SiteRecordHeader
          back={{
            label: `Work Order ${number}`,
            href: workOrdersPath(projectId, id),
          }}
          title={
            mode === "edit"
              ? `Edit Work Order ${number}`
              : `Amend Work Order ${number}`
          }
        />
      </div>
      {allowed ? (
        <WorkOrderForm projectId={projectId} workOrder={data} mode={mode} />
      ) : (
        <p className="text-muted-foreground max-w-4xl text-sm">
          {mode === "edit"
            ? "Only a draft Work Order can be edited. Amend an issued one instead."
            : "Only an issued Work Order can be amended."}
        </p>
      )}
    </div>
  );
}
