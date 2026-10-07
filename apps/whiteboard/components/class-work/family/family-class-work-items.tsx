"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AttachmentLinks } from "@/components/class-work/attachments";
import type { FamilyHomeRole } from "@/components/home/family-home";
import type {
  FamilyClassWorkStudentView,
  FamilyHomeworkView,
  FamilyStudyMaterialView,
} from "@/src/queries/class-work";

import {
  batchLabel,
  batchTimezone,
  batchToday,
  calendarDate,
  dueLabel,
  findBatch,
  homeworkDetailPath,
  instantDate,
  linkHost,
} from "./family-class-work-format";

export const DUE_SOON_BADGE =
  "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100";

/** The badge a Homework row carries, if any. */
export function HomeworkStatusBadge({
  homework,
}: {
  homework: FamilyHomeworkView;
}) {
  switch (homework.status) {
    case "overdue":
      return <Badge variant="destructive">Overdue</Badge>;
    case "due":
      // The row already says "Due today" or "Due tomorrow".
      return null;
    case "late":
      return <Badge variant="outline">Late</Badge>;
    case "submitted":
      return <Badge variant="secondary">Submitted</Badge>;
    case "checked":
      return <Badge variant="secondary">Checked</Badge>;
    case "reference":
      return <Badge variant="outline">For reference</Badge>;
  }
}

/** One Homework line: title link, Batch, Class and due dates, status badge. */
export function HomeworkRow({
  homework,
  student,
  role,
  now,
  showRemark = false,
}: {
  homework: FamilyHomeworkView;
  student: FamilyClassWorkStudentView;
  role: FamilyHomeRole;
  now: Date;
  showRemark?: boolean;
}) {
  const batch = findBatch(student, homework.batchId);
  const today = batchToday(batch, now);
  const label = batchLabel(batch);
  const remark = homework.submission?.remark;
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <Link
          href={homeworkDetailPath(role, homework.id, student.id)}
          className="font-medium break-words underline-offset-4 hover:underline"
        >
          {homework.title}
        </Link>
        {label != null && (
          <p className="text-muted-foreground text-xs">{label}</p>
        )}
        <p className="text-muted-foreground text-xs">
          Class: {calendarDate(homework.classDate)} ·{" "}
          <span
            className={
              homework.status === "overdue"
                ? "text-destructive font-medium"
                : homework.status === "due" && homework.dueOn === today
                  ? "font-medium text-amber-700 dark:text-amber-300"
                  : undefined
            }
          >
            {dueLabel(homework, today)}
          </span>
        </p>
        {showRemark && remark != null && remark.length > 0 && (
          <p className="line-clamp-2 text-xs break-words">
            <span className="text-muted-foreground">Remark: </span>
            {remark}
          </p>
        )}
      </div>
      <div className="shrink-0">
        <HomeworkStatusBadge homework={homework} />
      </div>
    </li>
  );
}

const LONG_NOTE_CHARACTERS = 240;
const LONG_NOTE_LINES = 4;

function NoteText({ note }: { note: string }) {
  const [expanded, setExpanded] = useState(false);
  const long =
    note.length > LONG_NOTE_CHARACTERS ||
    note.split("\n").length > LONG_NOTE_LINES;
  return (
    <div className="space-y-1">
      <p
        className={`text-sm break-words whitespace-pre-line ${long && !expanded ? "line-clamp-4" : ""}`}
      >
        {note}
      </p>
      {long && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
}

/** One Study Material: title, Batch, Class date, note, link, and files. */
export function StudyMaterialItem({
  material,
  student,
  compact = false,
}: {
  material: FamilyStudyMaterialView;
  student: FamilyClassWorkStudentView;
  /** On Home: title, Batch, and date only. */
  compact?: boolean;
}) {
  const batch = findBatch(student, material.batchId);
  const label = batchLabel(batch);
  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="space-y-0.5">
        <p className="font-medium break-words">{material.title}</p>
        <p className="text-muted-foreground text-xs">
          {[
            label,
            material.classDate == null
              ? `Posted ${instantDate(material.postedAt, batchTimezone(batch))}`
              : `For ${calendarDate(material.classDate)}’s Class`,
          ]
            .filter((part) => part != null)
            .join(" · ")}
        </p>
      </div>
      {!compact && (
        <>
          {material.note != null && material.note.length > 0 && (
            <NoteText note={material.note} />
          )}
          {material.linkUrl != null && (
            <a
              href={material.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex max-w-full items-center gap-1 text-sm break-all underline-offset-4 hover:underline"
            >
              <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
              {linkHost(material.linkUrl)}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <AttachmentLinks attachments={material.attachments} />
        </>
      )}
    </li>
  );
}
