import {
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  CircleCheck,
  CircleX,
  IndianRupee,
  MessageSquareText,
  PencilLine,
  RotateCcw,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { formatPaiseAsRupees } from "@/lib/money";
import { clockLabel } from "@/lib/class-changes";
import type {
  DemoResponse,
  EnquiryDetailResponse,
} from "@/src/queries/enquiries";

import {
  dayDate,
  demoTitle,
  shortDate,
  timestampLabel,
} from "./enquiry-format";

export type TimelineEntry = {
  id: string;
  at: string;
  icon: LucideIcon;
  title: string;
  detail: string | null;
};

function demoShort(demo: DemoResponse): string {
  return `${demoTitle(demo)}, ${dayDate(demo.date)} ${clockLabel(demo.startTime)}`;
}

/** Follow-ups and demo events in one list, newest first. */
export function buildEnquiryTimeline(
  enquiry: Pick<
    EnquiryDetailResponse,
    "history" | "demos" | "notInterestedReason"
  >,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const activity of enquiry.history) {
    const next =
      activity.nextFollowUpOn == null
        ? null
        : `Next follow-up set for ${shortDate(activity.nextFollowUpOn)}`;
    switch (activity.kind) {
      case "created":
        entries.push({
          id: activity.id,
          at: activity.createdAt,
          icon: Sparkles,
          title: "Enquiry added",
          detail: next,
        });
        break;
      case "follow_up":
        entries.push({
          id: activity.id,
          at: activity.createdAt,
          icon: MessageSquareText,
          title: `Follow-up: ${activity.note ?? ""}`.trim(),
          detail: next ?? "No next follow-up",
        });
        break;
      case "not_interested":
        entries.push({
          id: activity.id,
          at: activity.createdAt,
          icon: CircleX,
          title:
            `Marked not interested: ${activity.note ?? enquiry.notInterestedReason ?? ""}`.trim(),
          detail: null,
        });
        break;
      case "reopened":
        entries.push({
          id: activity.id,
          at: activity.createdAt,
          icon: RotateCcw,
          title: "Reopened",
          detail: next,
        });
        break;
      case "joined":
        entries.push({
          id: activity.id,
          at: activity.createdAt,
          icon: CircleCheck,
          title: "Joined as a Student",
          detail: activity.note,
        });
        break;
      case "details_updated":
        entries.push({
          id: activity.id,
          at: activity.createdAt,
          icon: PencilLine,
          title: "Details updated",
          detail: activity.note,
        });
        break;
    }
  }
  for (const demo of enquiry.demos) {
    entries.push({
      id: `${demo.id}:booked`,
      at: demo.createdAt,
      icon: CalendarPlus,
      title: `Demo booked: ${demoShort(demo)}`,
      detail:
        demo.feeKind === "paid"
          ? `Paid demo, ${formatPaiseAsRupees(demo.feeAmountPaise ?? 0)}`
          : "Free demo",
    });
    if (demo.attendanceMarkedAt != null && demo.attendance !== "unmarked") {
      entries.push({
        id: `${demo.id}:attendance`,
        at: demo.attendanceMarkedAt,
        icon: demo.attendance === "attended" ? CalendarCheck : CalendarX,
        title:
          demo.attendance === "attended"
            ? `Attended the demo: ${demoShort(demo)}`
            : `Missed the demo: ${demoShort(demo)}`,
        detail: null,
      });
    }
    if (demo.feePaidAt != null) {
      entries.push({
        id: `${demo.id}:paid`,
        at: demo.feePaidAt,
        icon: IndianRupee,
        title: `Demo fee paid: ${formatPaiseAsRupees(demo.feeAmountPaise ?? 0)}`,
        detail: null,
      });
    }
    if (demo.cancelledAt != null) {
      entries.push({
        id: `${demo.id}:cancelled`,
        at: demo.cancelledAt,
        icon: CalendarX,
        title: `Demo cancelled: ${demoShort(demo)}`,
        detail: null,
      });
    }
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}

export function EnquiryHistory({
  enquiry,
}: {
  enquiry: Pick<
    EnquiryDetailResponse,
    "history" | "demos" | "notInterestedReason"
  >;
}) {
  const entries = buildEnquiryTimeline(enquiry);
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">Nothing logged yet.</p>;
  }
  return (
    <ol className="relative space-y-5" aria-label="Enquiry history">
      {entries.map((entry, index) => {
        const Icon = entry.icon;
        return (
          <li key={entry.id} className="relative flex gap-3">
            {index < entries.length - 1 ? (
              <span
                aria-hidden="true"
                className="bg-border absolute top-8 bottom-[-1.25rem] left-4 w-px"
              />
            ) : null}
            <span className="bg-muted text-muted-foreground relative flex size-8 shrink-0 items-center justify-center rounded-full">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium break-words whitespace-pre-line">
                {entry.title}
              </p>
              {entry.detail == null ? null : (
                <p className="text-muted-foreground text-sm">{entry.detail}</p>
              )}
              <p className="text-muted-foreground mt-0.5 text-xs">
                <time dateTime={entry.at}>{timestampLabel(entry.at)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
