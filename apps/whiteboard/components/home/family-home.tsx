"use client";

import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@repo/ui/components/empty";
import { Download } from "lucide-react";
import Link from "next/link";

import { ResultsHomeCard } from "@/components/class-tests/family/results-home-card";
import { HomeworkHomeCards } from "@/components/class-work/family/homework-home-cards";
import { formatPaiseAsRupees } from "@/lib/money";
import type { FamilyTestResultsView } from "@/src/queries/class-tests";
import type {
  FamilyClassWorkStudentView,
  FamilyClassWorkView,
} from "@/src/queries/class-work";
import { classApiPath, classPath } from "@/src/queries/classes";
import type {
  FamilyHomeResponse,
  FamilyHomeStudent,
} from "@/src/queries/family-home";
import {
  addCalendarDays,
  localNow,
} from "@/src/training-institute/domain/class-schedule";

export type FamilyHomeRole = "student" | "parent";

const CLASS_MODE_LABELS = {
  offline: "Offline",
  online: "Online",
  hybrid: "Hybrid",
} as const;

const ATTENDANCE_LABELS = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
} as const;

function calendarDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addCalendarDays(today, 1)) return "Tomorrow";
  return calendarDate(date);
}

function NextClassCard({
  nextClass,
  now,
}: {
  nextClass: FamilyHomeStudent["nextClass"];
  now: Date;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next Class</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {nextClass == null ? (
          <p className="text-muted-foreground">No upcoming Classes.</p>
        ) : (
          <>
            <p className="font-medium">
              {nextClass.courseName} · {nextClass.batchName}
            </p>
            <p>
              {nextClass.inProgress
                ? "In progress"
                : dayLabel(
                    nextClass.date,
                    localNow(now, nextClass.timezone).date,
                  )}{" "}
              · {nextClass.startTime}–{nextClass.endTime}
              {nextClass.rescheduled && " · Rescheduled"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {CLASS_MODE_LABELS[nextClass.classMode]}
              </Badge>
              {nextClass.classMode !== "online" && nextClass.room != null && (
                <span className="text-muted-foreground">
                  Room {nextClass.room}
                </span>
              )}
            </div>
            {nextClass.classMode !== "offline" && (
              <Link
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className: "mt-2",
                })}
                href={classPath(
                  nextClass.batchId,
                  nextClass.date,
                  nextClass.startTime,
                )}
              >
                Open Class
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DuesCard({ dues }: { dues: FamilyHomeStudent["dues"] }) {
  const total = dues.reduce((sum, due) => sum + due.remainingDuesPaise, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dues</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {dues.length === 0 ? (
          <p className="text-muted-foreground">No active Enrollments.</p>
        ) : (
          <>
            <p className="text-2xl tracking-tight">
              {total === 0 ? "Nothing due" : formatPaiseAsRupees(total)}
            </p>
            <ul className="space-y-2">
              {dues.map((due) => (
                <li
                  key={due.enrollmentId}
                  className="flex items-start justify-between gap-3"
                >
                  <span className="flex flex-col">
                    <span>
                      {due.courseName} · {due.batchName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatPaiseAsRupees(due.paidPaise)} of{" "}
                      {formatPaiseAsRupees(due.feePlanPaise)} paid
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">
                    {formatPaiseAsRupees(due.remainingDuesPaise)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceCard({
  marks,
}: {
  marks: FamilyHomeStudent["recentAttendance"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Attendance</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {marks.length === 0 ? (
          <p className="text-muted-foreground">No Attendance marked yet.</p>
        ) : (
          <ul className="space-y-2">
            {marks.map((mark) => (
              <li
                key={`${mark.date}:${mark.batchName}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex flex-col">
                  <span>{calendarDate(mark.date)}</span>
                  <span className="text-muted-foreground text-xs">
                    {mark.courseName} · {mark.batchName}
                  </span>
                </span>
                <Badge
                  variant={mark.status === "absent" ? "destructive" : "outline"}
                >
                  {ATTENDANCE_LABELS[mark.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecordingsCard({
  recordings,
}: {
  recordings: FamilyHomeStudent["recordings"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recordings</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {recordings.length === 0 ? (
          <p className="text-muted-foreground">No recordings yet.</p>
        ) : (
          <ul className="space-y-2">
            {recordings.map((recording) => (
              <li
                key={`${recording.batchId}:${recording.date}:${recording.startTime}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex flex-col">
                  <span>
                    {calendarDate(recording.date)} · {recording.startTime}–
                    {recording.endTime}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {recording.courseName} · {recording.batchName}
                  </span>
                </span>
                <a
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                  href={`${classApiPath(recording.batchId, recording.date, recording.startTime)}/recording`}
                  aria-label={`Download recording of ${calendarDate(recording.date)} ${recording.startTime}`}
                >
                  <Download className="size-4" /> Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const NO_CLASS_WORK: FamilyClassWorkView = { students: [] };
const NO_RESULTS: FamilyTestResultsView = { students: [] };

function StudentCards({
  student,
  classWork,
  results,
  role,
  now,
}: {
  student: FamilyHomeStudent;
  classWork: FamilyClassWorkView;
  results: FamilyTestResultsView;
  role: FamilyHomeRole;
  now: Date;
}) {
  const studentClassWork: FamilyClassWorkStudentView = classWork.students.find(
    (candidate) => candidate.id === student.id,
  ) ?? {
    id: student.id,
    name: student.name,
    batches: [],
    homework: [],
    materials: [],
  };
  const studentResults = results.students.find(
    (candidate) => candidate.id === student.id,
  ) ?? { id: student.id, name: student.name, results: [] };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <NextClassCard nextClass={student.nextClass} now={now} />
      <DuesCard dues={student.dues} />
      <HomeworkHomeCards student={studentClassWork} role={role} now={now} />
      <ResultsHomeCard student={studentResults} role={role} />
      <AttendanceCard marks={student.recentAttendance} />
      <RecordingsCard recordings={student.recordings} />
    </div>
  );
}

export function FamilyHome({
  home,
  role,
  classWork = NO_CLASS_WORK,
  results = NO_RESULTS,
  now = new Date(),
}: {
  home: FamilyHomeResponse;
  role: FamilyHomeRole;
  /** Homework and Study Material for the same Students. */
  classWork?: FamilyClassWorkView;
  /** Published Test results for the same Students. */
  results?: FamilyTestResultsView;
  now?: Date;
}) {
  const title = role === "parent" ? "Parent Home" : "Student Home";
  return (
    <main className="w-full p-6">
      <div className="max-w-5xl space-y-6">
        <h1 className="text-2xl tracking-tight">{title}</h1>
        {home.students.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyDescription>
                {role === "parent"
                  ? "No Students are linked to you yet. Ask the centre to add your email address to your child’s Student profile."
                  : "Your Student record isn’t linked yet. Ask the centre to check the email address on your Student profile."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : role === "parent" ? (
          home.students.map((student) => (
            <section
              key={student.id}
              aria-labelledby={`student-${student.id}`}
              className="space-y-3"
            >
              <h2
                id={`student-${student.id}`}
                className="text-lg tracking-tight"
              >
                {student.name}
              </h2>
              <StudentCards
                student={student}
                classWork={classWork}
                results={results}
                role={role}
                now={now}
              />
            </section>
          ))
        ) : (
          home.students.map((student) => (
            <StudentCards
              key={student.id}
              student={student}
              classWork={classWork}
              results={results}
              role={role}
              now={now}
            />
          ))
        )}
      </div>
    </main>
  );
}
