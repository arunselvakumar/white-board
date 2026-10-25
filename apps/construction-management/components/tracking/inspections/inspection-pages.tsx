"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";

import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import {
  inspectionQuery,
  inspectionReinspectionQuery,
  inspectionsPath,
} from "@/src/queries/tracking-inspections";

import { InspectionForm } from "./inspection-form";

/** Add Inspection Request (CM-804). */
export function InspectionNew({ projectId }: { projectId: string }) {
  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-4xl flex-col gap-4">
        <SiteRecordHeader
          back={{
            label: "Inspection Requests",
            href: inspectionsPath(projectId),
          }}
          title="Add Inspection Request"
        />
        <InspectionForm projectId={projectId} />
      </div>
    </div>
  );
}

/**
 * **Raise re-inspection** (CM-0019 §10): Add Inspection Request prefilled
 * from a rejected request (`?reinspect=<id>`); the new request links back.
 */
export function InspectionReinspect({
  projectId,
  originalId,
}: {
  projectId: string;
  originalId: string;
}) {
  const { data: original } = useSuspenseQuery(inspectionQuery(originalId));
  const { data: draft } = useSuspenseQuery(
    inspectionReinspectionQuery(originalId),
  );
  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-4xl flex-col gap-4">
        <SiteRecordHeader
          back={{
            label: original.number,
            href: inspectionsPath(projectId, `/${originalId}`),
          }}
          title="Raise re-inspection"
        />
        <InspectionForm
          projectId={projectId}
          reinspection={draft}
          reinspectionOfNumber={original.number}
        />
      </div>
    </div>
  );
}

/** Edit a pending Inspection Request (CM-804); a decided one is final. */
export function InspectionEdit({
  projectId,
  inspectionId,
}: {
  projectId: string;
  inspectionId: string;
}) {
  const { data } = useSuspenseQuery(inspectionQuery(inspectionId));
  const back = inspectionsPath(projectId, `/${inspectionId}`);
  return (
    <div className="w-full p-6">
      <div className="flex w-full max-w-4xl flex-col gap-4">
        <SiteRecordHeader
          back={{ label: data.number, href: back }}
          title={`Edit ${data.number}`}
        />
        {data.actions.edit ? (
          <InspectionForm projectId={projectId} inspection={data} />
        ) : (
          <div className="bg-card space-y-3 rounded-xl border p-4">
            <p className="text-sm">
              {data.status === "pending"
                ? "You cannot edit Inspection Requests on this Project."
                : `${data.number} is ${data.status}; a decided request can no longer be edited. Add a remark instead.`}
            </p>
            <Link
              href={back}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Open {data.number}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
