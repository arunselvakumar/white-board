import { dateKeyInZone } from "@/lib/calendar-dates";
import { classModeLabel } from "@/lib/class-mode";
import { clockLabel } from "@/lib/class-changes";
import {
  hasStarted,
  localNow,
} from "@/src/training-institute/domain/class-schedule";
import type { DemoResponse, EnquiryResponse } from "@/src/queries/enquiries";

/** Enquiries, follow-ups, and one-to-one demos use the Batch default zone. */
export const ENQUIRY_TIMEZONE = "Asia/Kolkata";

export function todayInKolkata(now: Date = new Date()): string {
  return dateKeyInZone(now, ENQUIRY_TIMEZONE);
}

function utcDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** "12 Oct" — a calendar date, without the year. */
export function shortDate(key: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(utcDate(key));
}

/** "Thu 9 Oct" */
export function dayDate(key: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(utcDate(key));
}

/** "9 Oct 2026" */
export function longDate(key: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(utcDate(key));
}

/** "9 Oct, 3:45 pm" for a timestamp, in the institute's timezone. */
export function timestampLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ENQUIRY_TIMEZONE,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** The date of a timestamp, in the institute's timezone. */
export function timestampDate(iso: string): string {
  return longDate(dateKeyInZone(new Date(iso), ENQUIRY_TIMEZONE));
}

export function enquiryInterest(
  enquiry: Pick<EnquiryResponse, "courseName" | "subject">,
): string | null {
  return enquiry.courseName ?? enquiry.subject;
}

export function preferredClassModeLabel(
  mode: EnquiryResponse["preferredClassMode"],
): string {
  return mode == null ? "No preference" : classModeLabel(mode);
}

export function demoTimeRange(
  demo: Pick<DemoResponse, "startTime" | "endTime">,
) {
  return `${clockLabel(demo.startTime)}–${clockLabel(demo.endTime)}`;
}

/** "Thu 9 Oct · 9:00 AM–11:00 AM" */
export function demoWhen(
  demo: Pick<DemoResponse, "date" | "startTime" | "endTime">,
): string {
  return `${dayDate(demo.date)} · ${demoTimeRange(demo)}`;
}

/** "DCA Weekday 9–11" or "One-to-one with Meena Iyer" */
export function demoTitle(
  demo: Pick<DemoResponse, "kind" | "batchName" | "teacherName">,
): string {
  if (demo.kind === "batch") return demo.batchName ?? "Batch demo";
  return demo.teacherName == null
    ? "One-to-one demo"
    : `One-to-one with ${demo.teacherName}`;
}

/** Attendance can be marked once the demo's start time has passed. */
export function demoHasStarted(
  demo: Pick<DemoResponse, "date" | "startTime" | "timezone">,
  now: Date = new Date(),
): boolean {
  return hasStarted(demo, localNow(now, demo.timezone || ENQUIRY_TIMEZONE));
}

export function isClosedStage(stage: EnquiryResponse["stage"]): boolean {
  return stage === "joined" || stage === "not_interested";
}
