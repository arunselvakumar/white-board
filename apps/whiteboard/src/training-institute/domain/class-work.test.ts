import { describe, expect, it } from "vitest";

import {
  attachmentName,
  canSeeItem,
  familyHomeworkStatus,
  homeworkContent,
  isLate,
  isOverdue,
  linkUrl,
  owesHomework,
  remark,
  studyMaterialContent,
  submissionNote,
} from "./class-work";

function codeOf(work: () => unknown): string | undefined {
  try {
    work();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("Study Material", () => {
  it("needs a title and at least a note, a link, or a file", () => {
    expect(codeOf(() => studyMaterialContent({ title: "Notes" }, 0))).toBe(
      "STUDY_MATERIAL_EMPTY",
    );
    expect(
      codeOf(() => studyMaterialContent({ title: " ", note: "x" }, 0)),
    ).toBe("CLASS_WORK_TITLE_INVALID");
    expect(studyMaterialContent({ title: " Notes ", note: " " }, 1)).toEqual({
      title: "Notes",
      note: null,
      linkUrl: null,
      classDate: null,
    });
    expect(
      studyMaterialContent(
        { title: "Slides", linkUrl: " https://example.com/a ", classDate: "" },
        0,
      ),
    ).toMatchObject({ linkUrl: "https://example.com/a", classDate: null });
  });

  it("refuses more than five files and a bad Class date", () => {
    expect(
      codeOf(() => studyMaterialContent({ title: "A", note: "n" }, 6)),
    ).toBe("ATTACHMENT_LIMIT");
    expect(
      codeOf(() =>
        studyMaterialContent(
          { title: "A", note: "n", classDate: "2026-02-30" },
          0,
        ),
      ),
    ).toBe("CLASS_WORK_DATE_INVALID");
  });
});

describe("linkUrl", () => {
  it("accepts only http and https links", () => {
    expect(linkUrl("http://example.com")).toBe("http://example.com");
    expect(linkUrl(null)).toBeNull();
    for (const bad of [
      "javascript:alert(1)",
      "example.com",
      "ftp://x.y",
      "data:text/html,hi",
    ])
      expect(
        codeOf(() => linkUrl(bad)),
        bad,
      ).toBe("LINK_URL_INVALID");
    expect(
      codeOf(() => linkUrl(`https://example.com/${"a".repeat(2048)}`)),
    ).toBe("LINK_URL_INVALID");
  });
});

describe("Homework", () => {
  const valid = {
    title: "Chapter 3",
    instructions: "Exercises 1–5",
    classDate: "2026-10-05",
    dueOn: "2026-10-07",
  };

  it("is due on or after its Class date", () => {
    expect(homeworkContent(valid, 0)).toEqual(valid);
    expect(homeworkContent({ ...valid, dueOn: "2026-10-05" }, 0).dueOn).toBe(
      "2026-10-05",
    );
    expect(
      codeOf(() => homeworkContent({ ...valid, dueOn: "2026-10-04" }, 0)),
    ).toBe("HOMEWORK_DUE_BEFORE_CLASS");
  });

  it("needs instructions", () => {
    expect(
      codeOf(() => homeworkContent({ ...valid, instructions: "  " }, 0)),
    ).toBe("HOMEWORK_INSTRUCTIONS_INVALID");
  });
});

describe("due dates in the Batch's timezone", () => {
  // 2026-10-07 23:00 in Asia/Kolkata is 17:30 UTC the same day.
  const lateEvening = new Date("2026-10-07T17:30:00.000Z");
  // 2026-10-08 00:30 in Asia/Kolkata is still 2026-10-07 in UTC.
  const pastMidnight = new Date("2026-10-07T19:00:00.000Z");

  it("is overdue from the day after the due date", () => {
    expect(isOverdue("2026-10-07", lateEvening, "Asia/Kolkata")).toBe(false);
    expect(isOverdue("2026-10-07", pastMidnight, "Asia/Kolkata")).toBe(true);
  });

  it("marks a Submission Late when made after the due date", () => {
    expect(isLate(lateEvening, "2026-10-07", "Asia/Kolkata")).toBe(false);
    expect(isLate(pastMidnight, "2026-10-07", "Asia/Kolkata")).toBe(true);
  });
});

describe("what a Student sees and owes", () => {
  const left = new Date("2026-10-10T10:00:00.000Z");

  it("sees everything while in the Batch, and items up to leaving", () => {
    const old = new Date("2026-01-01T00:00:00.000Z");
    expect(canSeeItem({ start: "2026-10-01", endedAt: null }, old)).toBe(true);
    expect(canSeeItem({ start: "2026-10-01", endedAt: left }, left)).toBe(true);
    expect(
      canSeeItem(
        { start: "2026-10-01", endedAt: left },
        new Date("2026-10-10T10:00:01.000Z"),
      ),
    ).toBe(false);
  });

  it("owes Homework due on or after joining, while still in the Batch", () => {
    const active = { start: "2026-10-05", endedAt: null };
    expect(owesHomework(active, "2026-10-04")).toBe(false);
    expect(owesHomework(active, "2026-10-05")).toBe(true);
    expect(owesHomework({ ...active, endedAt: left }, "2026-10-06")).toBe(
      false,
    );
  });
});

describe("familyHomeworkStatus", () => {
  it("prefers the Submission, then whether it's owed and overdue", () => {
    const sub = (late: boolean, checked: boolean) => ({ late, checked });
    expect(
      familyHomeworkStatus({
        owed: true,
        overdue: true,
        submission: sub(true, true),
      }),
    ).toBe("checked");
    expect(
      familyHomeworkStatus({
        owed: true,
        overdue: true,
        submission: sub(true, false),
      }),
    ).toBe("late");
    expect(
      familyHomeworkStatus({
        owed: false,
        overdue: false,
        submission: sub(false, false),
      }),
    ).toBe("submitted");
    expect(
      familyHomeworkStatus({ owed: true, overdue: true, submission: null }),
    ).toBe("overdue");
    expect(
      familyHomeworkStatus({ owed: true, overdue: false, submission: null }),
    ).toBe("due");
    expect(
      familyHomeworkStatus({ owed: false, overdue: true, submission: null }),
    ).toBe("reference");
  });
});

describe("short texts", () => {
  it("trims, empties to null, and caps length", () => {
    expect(submissionNote("  ")).toBeNull();
    expect(remark(" Good work ")).toBe("Good work");
    expect(codeOf(() => remark("x".repeat(501)))).toBe(
      "HOMEWORK_REMARK_TOO_LONG",
    );
    expect(codeOf(() => submissionNote("x".repeat(1001)))).toBe(
      "HOMEWORK_SUBMISSION_NOTE_TOO_LONG",
    );
  });

  it("keeps file names safe for download headers", () => {
    expect(attachmentName("C:\\Users\\me\\work.pdf")).toBe("work.pdf");
    expect(attachmentName('../a"b\nc.png')).toBe("abc.png");
    expect(attachmentName("   ")).toBe("attachment");
  });
});
