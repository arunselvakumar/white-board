"use client";

import { useAuth } from "@repo/auth/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarCheck, Clock } from "lucide-react";
import { useId } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { PageHeader } from "@/components/app-shell/page-header";
import { StudentAvatar } from "@/components/students/student-avatar";
import {
  expectedAbsenceDays,
  giverLabel,
  reasonLabel,
  timeRangeLabel,
  timestampLabel,
  type ExpectedAbsenceDay,
} from "@/lib/absence-notice-labels";
import {
  absenceNoticeQueries,
  type ExpectedAbsenceClassView,
  type ExpectedAbsencesView,
} from "@/src/queries/absence-notices";

/** The Owner sees every Batch; a Teacher sees only assigned Batches. */
export type AbsenceNoticesAudience = "owner" | "teacher";

const COPY: Record<
  AbsenceNoticesAudience,
  { meta: string; emptyDescription: string }
> = {
  owner: {
    meta: "Students who gave notice that they’ll miss an upcoming Class in the next 60 days, across every Batch.",
    emptyDescription:
      "When a Student or Parent gives notice that the Student will miss a Class, it shows here with the reason.",
  },
  teacher: {
    meta: "Students in your Batches who gave notice that they’ll miss an upcoming Class in the next 60 days.",
    emptyDescription:
      "When a Student in your Batches, or their Parent, gives notice for a Class, it shows here and you get a Notification.",
  },
};

export function AbsenceNoticesScreen({
  audience,
}: {
  audience: AbsenceNoticesAudience;
}) {
  const { workspaceId, userId } = useAuth();
  const { data } = useSuspenseQuery(
    absenceNoticeQueries.expected(`${workspaceId ?? ""}:${userId ?? ""}`),
  );
  return <AbsenceNoticesContent view={data} audience={audience} />;
}

export function AbsenceNoticesContent({
  view,
  audience,
  now = new Date(),
}: {
  view: ExpectedAbsencesView;
  audience: AbsenceNoticesAudience;
  /** Decides Today and Tomorrow; stories pin it. */
  now?: Date;
}) {
  const copy = COPY[audience];
  const days = expectedAbsenceDays(view.classes, now);
  return (
    <main className="w-full min-w-0 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader title="Absence Notices" meta={copy.meta} />
        {days.length === 0 ? (
          <Empty className="rounded-2xl border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheck aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No absence notices for upcoming Classes</EmptyTitle>
              <EmptyDescription>{copy.emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          days.map((day) => <DaySection key={day.date} day={day} />)
        )}
      </div>
    </main>
  );
}

function DaySection({ day }: { day: ExpectedAbsenceDay }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2
        id={headingId}
        className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold"
      >
        {day.heading}
        {day.subheading == null ? null : " "}
        {day.subheading == null ? null : (
          <span className="text-muted-foreground text-sm font-normal">
            {day.subheading}
          </span>
        )}
      </h2>
      {day.classes.map((item) => (
        <ClassCard key={`${item.batchId}:${item.startTime}`} item={item} />
      ))}
    </section>
  );
}

function ClassCard({ item }: { item: ExpectedAbsenceClassView }) {
  const time = timeRangeLabel(item.startTime, item.endTime);
  const count = item.absentees.length;
  return (
    <Card role="article" aria-label={`${item.batchName}, ${time}`}>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold break-words">
              {item.batchName}
              {item.rescheduled ? (
                <Badge variant="secondary">Rescheduled</Badge>
              ) : null}
            </h3>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="break-words">{item.courseName}</span>
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden="true" className="size-3.5" />
                {time}
              </span>
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {count === 1
              ? "1 Student gave notice"
              : `${String(count)} Students gave notice`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul
          aria-label={`Absence Notices for ${item.batchName}, ${time}`}
          className="divide-border divide-y"
        >
          {item.absentees.map((absentee) => (
            <li
              key={absentee.noticeId}
              className="flex gap-3 py-3 first:pt-0 last:pb-0"
            >
              <StudentAvatar
                studentId={absentee.studentId}
                name={absentee.studentName}
                className="size-9 shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words">
                    {absentee.studentName}
                  </span>
                  <Badge
                    variant="outline"
                    className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
                  >
                    {reasonLabel(absentee.reason)}
                  </Badge>
                </p>
                {absentee.note == null ? null : (
                  <p className="text-sm break-words whitespace-pre-line">
                    “{absentee.note}”
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Notice by {giverLabel(absentee.givenBy)} ·{" "}
                  {timestampLabel(absentee.givenAt, item.timezone)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
