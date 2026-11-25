import type { IsoDate } from "./dates";
import { invalid } from "./errors";

export const ANNOUNCEMENT_KINDS = ["notice", "event", "holiday"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

/** Kinds a Teacher may post, and only to their own Classroom. */
export const TEACHER_ANNOUNCEMENT_KINDS: readonly AnnouncementKind[] = [
  "notice",
  "event",
];

/** Who an Announcement reaches: every Centre, one Centre, or one Classroom of it. */
export type AnnouncementAudience =
  | { scope: "all_centres" }
  | { scope: "centre"; centreId: string }
  | { scope: "classroom"; centreId: string; classroomId: string };

export function audienceOf(row: {
  centreId: string | null;
  classroomId: string | null;
}): AnnouncementAudience {
  if (row.centreId == null) return { scope: "all_centres" };
  if (row.classroomId == null)
    return { scope: "centre", centreId: row.centreId };
  return {
    scope: "classroom",
    centreId: row.centreId,
    classroomId: row.classroomId,
  };
}

/**
 * The dates an Announcement keeps: none for a notice; a first day for an
 * event or holiday, and a last day on or after it (the first day when left
 * out).
 */
export function announcementDates(
  kind: AnnouncementKind,
  startsOn: IsoDate | null | undefined,
  endsOn: IsoDate | null | undefined,
): { startsOn: IsoDate | null; endsOn: IsoDate | null } {
  if (kind === "notice") {
    if (startsOn != null || endsOn != null)
      throw invalid(
        "NOTICE_HAS_NO_DATES",
        "A notice has no dates. Choose event or holiday for a date.",
      );
    return { startsOn: null, endsOn: null };
  }
  if (startsOn == null)
    throw invalid(
      "ANNOUNCEMENT_DATE_REQUIRED",
      "Enter the first day of the event or holiday.",
    );
  const last = endsOn ?? startsOn;
  if (last < startsOn)
    throw invalid(
      "ANNOUNCEMENT_DATES_ORDER",
      "The last day cannot be before the first day.",
    );
  return { startsOn, endsOn: last };
}

/** Trimmed title and body; both required. */
export function announcementText(input: { title: string; body: string }): {
  title: string;
  body: string;
} {
  const title = input.title.trim();
  const body = input.body.trim();
  if (title === "")
    throw invalid("ANNOUNCEMENT_TITLE_REQUIRED", "Enter a title.");
  if (body === "")
    throw invalid("ANNOUNCEMENT_BODY_REQUIRED", "Write the Announcement.");
  return { title, body };
}
