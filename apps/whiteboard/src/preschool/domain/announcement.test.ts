import { describe, expect, it } from "vitest";

import {
  announcementDates,
  announcementText,
  audienceOf,
} from "./announcement";
import { PreschoolError } from "./errors";

function codeOf(work: () => unknown): string | null {
  try {
    work();
    return null;
  } catch (error) {
    if (error instanceof PreschoolError) return error.code;
    throw error;
  }
}

describe("announcementDates", () => {
  it("keeps no dates on a notice and refuses them", () => {
    expect(announcementDates("notice", null, undefined)).toEqual({
      startsOn: null,
      endsOn: null,
    });
    expect(codeOf(() => announcementDates("notice", "2026-12-01", null))).toBe(
      "NOTICE_HAS_NO_DATES",
    );
  });

  it("needs a first day for an event or holiday, and ends on it by default", () => {
    expect(codeOf(() => announcementDates("event", null, null))).toBe(
      "ANNOUNCEMENT_DATE_REQUIRED",
    );
    expect(announcementDates("holiday", "2026-12-25", undefined)).toEqual({
      startsOn: "2026-12-25",
      endsOn: "2026-12-25",
    });
    expect(
      codeOf(() => announcementDates("holiday", "2026-12-25", "2026-12-24")),
    ).toBe("ANNOUNCEMENT_DATES_ORDER");
  });
});

describe("announcementText and audienceOf", () => {
  it("needs a title and a body", () => {
    expect(codeOf(() => announcementText({ title: " ", body: "x" }))).toBe(
      "ANNOUNCEMENT_TITLE_REQUIRED",
    );
    expect(codeOf(() => announcementText({ title: "x", body: "" }))).toBe(
      "ANNOUNCEMENT_BODY_REQUIRED",
    );
  });

  it("reads the audience from the row", () => {
    expect(audienceOf({ centreId: null, classroomId: null })).toEqual({
      scope: "all_centres",
    });
    expect(audienceOf({ centreId: "c", classroomId: null })).toEqual({
      scope: "centre",
      centreId: "c",
    });
    expect(audienceOf({ centreId: "c", classroomId: "r" })).toEqual({
      scope: "classroom",
      centreId: "c",
      classroomId: "r",
    });
  });
});
