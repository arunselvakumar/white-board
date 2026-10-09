"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { Badge } from "@repo/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Spinner } from "@repo/ui/components/spinner";

import { reportsQuery, type ReportJob } from "@/src/queries/reports";

import { jobPeriod } from "./report-catalogue";
import { ReportDownloads } from "./report-downloads";

const requestedAt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function StatusChip({ job }: { job: ReportJob }) {
  switch (job.status) {
    case "done":
      return <Badge variant="secondary">Ready</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Spinner aria-hidden="true" className="size-3" />
          Generating
        </Badge>
      );
  }
}

/** The Project's newest reports with their status and downloads. */
export function RecentReports({ projectId }: { projectId: string }) {
  const { data } = useSuspenseQuery(reportsQuery(projectId));
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileSpreadsheet />
          </EmptyMedia>
          <EmptyTitle>No reports yet</EmptyTitle>
          <EmptyDescription>
            Generate a report above; its Excel and PDF stay here to download
            again.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <ul className="divide-y rounded-xl border" aria-label="Recent reports">
      {data.items.map((job) => (
        <li
          key={job.id}
          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{job.title}</span>
              <StatusChip job={job} />
            </div>
            <p className="text-muted-foreground text-sm">
              {jobPeriod(job)} · requested{" "}
              {requestedAt.format(new Date(job.createdAt))}
            </p>
            {job.status === "failed" && job.error != null ? (
              <p className="text-destructive text-sm">{job.error}</p>
            ) : null}
          </div>
          <ReportDownloads job={job} label={`${job.title} ${jobPeriod(job)}`} />
        </li>
      ))}
    </ul>
  );
}
