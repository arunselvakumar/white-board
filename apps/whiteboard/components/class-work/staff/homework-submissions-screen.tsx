"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleCheck, EyeOff } from "lucide-react";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";

import { PageHeader } from "@/components/app-shell/page-header";
import { AttachmentLinks } from "@/components/class-work/attachments";
import { StudentAvatar } from "@/components/students/student-avatar";
import {
  classWorkQueries,
  type HomeworkRosterRowView,
  type HomeworkRosterStatus,
  type HomeworkSubmissionsView,
} from "@/src/queries/class-work";

import {
  CheckSubmissionDialog,
  type CheckTarget,
} from "./check-submission-dialog";
import {
  dayDate,
  postedByLabel,
  setAfterPhrase,
  timestampLabel,
} from "./class-work-format";

export function HomeworkSubmissionsScreen({
  homeworkId,
  basePath,
}: {
  homeworkId: string;
  /** The Batch's Homework and Study Material page. */
  basePath: string;
}) {
  const { data } = useSuspenseQuery(classWorkQueries.submissions(homeworkId));
  return <HomeworkSubmissionsContent view={data} basePath={basePath} />;
}

const GROUPS: { status: HomeworkRosterStatus; label: string }[] = [
  { status: "not_submitted", label: "Not submitted" },
  { status: "late", label: "Late" },
  { status: "submitted", label: "Submitted" },
];

export function HomeworkSubmissionsContent({
  view,
  basePath,
}: {
  view: HomeworkSubmissionsView;
  basePath: string;
}) {
  const { homework, counts, today } = view;
  const timezone = view.batch.timezone;
  const [checking, setChecking] = useState<CheckTarget | null>(null);
  const removed = homework.removedAt != null;
  const overdue = today > homework.dueOn;
  const setAfter = setAfterPhrase(homework.classDate, today);

  return (
    <main className="w-full p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Homework and Study Material", href: basePath }}
          title={homework.title}
          meta={`${view.batch.courseName} · ${view.batch.name}`}
          actions={
            removed ? (
              <Badge variant="secondary" className="text-muted-foreground">
                Removed
              </Badge>
            ) : null
          }
        />
        {removed ? (
          <div
            role="status"
            className="bg-muted/50 flex items-start gap-2 rounded-2xl border p-4 text-sm"
          >
            <EyeOff
              aria-hidden="true"
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
            />
            <p>
              This Homework was removed. Students and Parents no longer see it.
              Its Submissions stay on record.
            </p>
          </div>
        ) : null}
        <Card aria-label="Homework" role="region">
          <CardHeader>
            <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span>Class: {dayDate(homework.classDate)}</span>
              <span>Due: {dayDate(homework.dueOn)}</span>
              {setAfter == null ? null : <span>{setAfter}</span>}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm break-words whitespace-pre-line">
              {homework.instructions}
            </p>
            <AttachmentLinks attachments={homework.attachments} />
            <p className="text-muted-foreground text-xs">
              Posted by {postedByLabel(homework.postedBy)} ·{" "}
              {timestampLabel(homework.postedAt, timezone)}
            </p>
          </CardContent>
        </Card>
        <dl
          aria-label="Submission counts"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Summary label="Submitted" value={counts.submitted} />
          <Summary label="Late" value={counts.late} />
          <Summary label="Not submitted" value={counts.notSubmitted} />
          <Summary label="Checked" value={counts.checked} />
        </dl>
        {view.students.length === 0 ? (
          <p className="text-muted-foreground rounded-2xl border p-6 text-center text-sm">
            No Students owe this Homework, and nobody has submitted it.
          </p>
        ) : (
          GROUPS.map((group) => {
            const rows = view.students.filter(
              (row) => row.status === group.status,
            );
            if (rows.length === 0) return null;
            return (
              <section
                key={group.status}
                aria-label={group.label}
                className="space-y-3"
              >
                <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
                  {group.label}
                  <span className="text-muted-foreground text-sm font-normal tabular-nums">
                    {rows.length}
                  </span>
                  {group.status === "not_submitted" && overdue ? (
                    <Badge variant="destructive">Overdue</Badge>
                  ) : null}
                </h2>
                <ul className="bg-card divide-y rounded-2xl border shadow-sm">
                  {rows.map((row) => (
                    <StudentRow
                      key={row.studentId}
                      row={row}
                      timezone={timezone}
                      onCheck={(target) => {
                        setChecking(target);
                      }}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
      <CheckSubmissionDialog
        target={checking}
        onOpenChange={(open) => {
          if (!open) setChecking(null);
        }}
        batchId={view.batch.id}
        homeworkId={homework.id}
      />
    </main>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-2xl border px-4 py-3 shadow-sm">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function StudentRow({
  row,
  timezone,
  onCheck,
}: {
  row: HomeworkRosterRowView;
  timezone: string;
  onCheck: (target: CheckTarget) => void;
}) {
  const { submission } = row;
  const checked = submission?.checkedAt != null;
  return (
    <li aria-label={row.studentName} className="flex gap-3 p-4">
      <StudentAvatar
        studentId={row.studentId}
        name={row.studentName}
        className="size-9 shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <p className="flex flex-wrap items-center gap-2 font-medium break-words">
              {row.studentName}
              {row.inBatch ? null : (
                <Badge variant="outline">Left the Batch</Badge>
              )}
            </p>
            {submission == null ? null : (
              <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                <span>{timestampLabel(submission.submittedAt, timezone)}</span>
                <Badge variant="secondary">
                  {submission.submittedBy === "parent"
                    ? "by Parent"
                    : "by Student"}
                </Badge>
                {checked ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                  >
                    <CircleCheck aria-hidden="true" />
                    Checked
                  </Badge>
                ) : null}
              </p>
            )}
          </div>
          {submission == null ? null : (
            <Button
              type="button"
              size="sm"
              variant={checked ? "ghost" : "outline"}
              aria-label={`${checked ? "Edit remark for" : "Check"} ${row.studentName}`}
              onClick={() => {
                onCheck({ studentName: row.studentName, submission });
              }}
            >
              {checked ? "Edit remark" : "Check"}
            </Button>
          )}
        </div>
        {submission?.note == null ? null : (
          <p className="text-sm break-words whitespace-pre-line">
            {submission.note}
          </p>
        )}
        {submission == null ? null : (
          <AttachmentLinks attachments={submission.attachments} />
        )}
        {checked && submission.remark != null ? (
          <p className="bg-muted/50 rounded-lg px-3 py-2 text-sm break-words whitespace-pre-line">
            <span className="text-muted-foreground text-xs font-medium">
              Remark:{" "}
            </span>
            {submission.remark}
          </p>
        ) : null}
      </div>
    </li>
  );
}
