"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import {
  canInTracking,
  trackingAccessQuery,
} from "@/src/queries/tracking-access";
import { issueQuery, issuesPath } from "@/src/queries/tracking-issues";

import { IssueForm } from "./issue-form";

/** Add an Issue & Snag (CM-803). */
export function IssueNew({ projectId }: { projectId: string }) {
  const { data: access } = useSuspenseQuery(trackingAccessQuery(projectId));
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <div className="w-full max-w-4xl">
        <SiteRecordHeader
          back={{ label: "Issues & Snags", href: issuesPath(projectId) }}
          title="Add Issue"
        />
      </div>
      <IssueForm
        projectId={projectId}
        canSolve={canInTracking(access, "tracking.issues", "update")}
      />
    </div>
  );
}

/** Edit an open Issue & Snag (CM-803). */
export function IssueEdit({
  projectId,
  issueId,
}: {
  projectId: string;
  issueId: string;
}) {
  const { data } = useSuspenseQuery(issueQuery(issueId));
  const href = issuesPath(projectId, issueId);
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <div className="w-full max-w-4xl">
        <SiteRecordHeader
          back={{ label: data.number, href }}
          title={`Edit ${data.number}`}
        />
      </div>
      {data.actions.edit ? (
        <IssueForm projectId={projectId} issue={data} />
      ) : (
        <p className="text-muted-foreground max-w-4xl text-sm">
          Only a Pending or Delayed issue can be edited. Reopen it on its page
          first.
        </p>
      )}
    </div>
  );
}
