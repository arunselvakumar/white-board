"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import { inquiriesPath, inquiryQuery } from "@/src/queries/sales-inquiries";

import { InquiryForm } from "./inquiry-form";

/** Add an inquiry with the full form (CM-1003). */
export function InquiryNew({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <div className="w-full max-w-4xl">
        <SiteRecordHeader
          back={{ label: "Inquiries", href: inquiriesPath(projectId) }}
          title="Add Inquiry"
        />
      </div>
      <InquiryForm projectId={projectId} />
    </div>
  );
}

/** Edit an inquiry (CM-1003). */
export function InquiryEdit({
  projectId,
  inquiryId,
}: {
  projectId: string;
  inquiryId: string;
}) {
  const { data } = useSuspenseQuery(inquiryQuery(inquiryId));
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <div className="w-full max-w-4xl">
        <SiteRecordHeader
          back={{ label: data.name, href: inquiriesPath(projectId, inquiryId) }}
          title={`Edit ${data.name}`}
        />
      </div>
      {data.actions.edit ? (
        <InquiryForm projectId={projectId} inquiry={data} />
      ) : (
        <p className="text-muted-foreground max-w-4xl text-sm">
          You can see this inquiry but not edit it.
        </p>
      )}
    </div>
  );
}
