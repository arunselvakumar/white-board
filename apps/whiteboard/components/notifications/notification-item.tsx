"use client";

import Link from "next/link";
import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

import {
  classCountLabel,
  classSlotLabel,
  reasonLabel,
  timestampLabel,
} from "@/lib/absence-notice-labels";
import type { NotificationView } from "@/src/queries/notifications";

/** Where every Absence Notice Notification leads (ADR-0041). */
export const TEACHER_ABSENCE_NOTICES_HREF = "/teacher/absence-notices";

/** Classes shown before "and N more" in the bell's short list. */
const COMPACT_CLASSES = 2;

/** "Asha Rao (Parent · Ramesh Rao) gave notice for 2 Classes" */
export function notificationHeadline(notification: NotificationView): string {
  const { payload } = notification;
  const who =
    payload.by.role === "parent" ? `Parent · ${payload.by.name}` : "Student";
  const verb =
    notification.kind === "absence_notice_withdrawn"
      ? "withdrew notice"
      : "gave notice";
  return `${payload.studentName} (${who}) ${verb} for ${classCountLabel(payload.classes.length)}`;
}

/**
 * One Notification about an Absence Notice. Opening it marks it read and
 * goes to the Teacher's Absence Notices.
 */
export function NotificationItem({
  notification,
  compact = false,
  onOpen,
}: {
  notification: NotificationView;
  /** The bell's short form: fewer Class lines, no note. */
  compact?: boolean;
  onOpen: (notification: NotificationView) => void;
}) {
  const { payload } = notification;
  const unread = notification.readAt == null;
  const withdrawn = notification.kind === "absence_notice_withdrawn";
  const classes = compact
    ? payload.classes.slice(0, COMPACT_CLASSES)
    : payload.classes;
  const more = payload.classes.length - classes.length;
  const headline = notificationHeadline(notification);

  return (
    <Link
      href={TEACHER_ABSENCE_NOTICES_HREF}
      aria-label={unread ? `Unread: ${headline}` : headline}
      data-unread={unread ? "" : undefined}
      onClick={() => {
        onOpen(notification);
      }}
      className={cn(
        "focus-visible:outline-ring hover:bg-muted/70 flex gap-3 rounded-xl p-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        unread && "bg-primary/5",
        !compact && "border",
      )}
    >
      <span
        aria-hidden="true"
        className="flex w-2 shrink-0 justify-center pt-1.5"
      >
        {unread ? <span className="bg-primary size-2 rounded-full" /> : null}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span
          className={cn(
            "block break-words",
            unread ? "font-semibold" : "font-medium",
          )}
        >
          {headline}
        </span>
        <span className="text-muted-foreground block break-words">
          {payload.batchName} · {payload.courseName}
        </span>
        <span className="block">
          {classes.map((slot) => (
            <span
              key={`${slot.date}:${slot.startTime}`}
              className={cn(
                "block break-words",
                withdrawn && "text-muted-foreground line-through",
              )}
            >
              {classSlotLabel(slot)}
            </span>
          ))}
          {more > 0 ? (
            <span className="text-muted-foreground block">
              and {classCountLabel(more)} more
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
          >
            {reasonLabel(payload.reason)}
          </Badge>
          {withdrawn ? <Badge variant="secondary">Withdrawn</Badge> : null}
        </span>
        {payload.note == null || compact ? null : (
          <span className="block break-words whitespace-pre-line">
            “{payload.note}”
          </span>
        )}
        <span className="text-muted-foreground block text-xs">
          {timestampLabel(notification.createdAt, payload.timezone)}
        </span>
      </span>
    </Link>
  );
}
