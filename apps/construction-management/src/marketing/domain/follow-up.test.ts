import { describe, expect, it } from "vitest";

import {
  followUpDetails,
  followUpDone,
  followUpDue,
  isFollowUpVisible,
  reminderDue,
} from "./follow-up";

const TODAY = "2026-11-12";

function code(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("Follow-up details (PRD §3.5)", () => {
  it("needs a due date and tidies the note", () => {
    expect(
      followUpDetails({
        type: "send_quotation",
        dueDate: "2026-11-20",
        note: " Send the PEB rates \n",
      }),
    ).toEqual({
      type: "send_quotation",
      dueDate: "2026-11-20",
      note: "Send the PEB rates",
    });
    expect(
      code(() => followUpDetails({ type: "call", dueDate: "20/11" })),
    ).toBe("FOLLOW_UP_DUE_DATE_INVALID");
  });

  it("marks Done today unless told, never on a day to come", () => {
    expect(followUpDone({ resultNote: "Sent" }, TODAY)).toEqual({
      resultNote: "Sent",
      doneOn: TODAY,
    });
    expect(code(() => followUpDone({ doneOn: "2026-11-13" }, TODAY))).toBe(
      "FOLLOW_UP_DONE_IN_FUTURE",
    );
  });
});

describe("Overdue, Today, Upcoming", () => {
  it("groups an Open Follow-up by its due date against today", () => {
    expect(followUpDue({ status: "open", dueDate: "2026-11-11" }, TODAY)).toBe(
      "overdue",
    );
    expect(followUpDue({ status: "open", dueDate: TODAY }, TODAY)).toBe(
      "today",
    );
    expect(followUpDue({ status: "open", dueDate: "2026-11-13" }, TODAY)).toBe(
      "upcoming",
    );
    expect(
      followUpDue({ status: "done", dueDate: "2026-11-11" }, TODAY),
    ).toBeNull();
  });
});

describe("Who sees a Follow-up (ADR CM-0040 §5)", () => {
  const followUp = { createdBy: "user-1", ownerMemberId: "member-2" };

  it("shows the creator and the owner, and no one else", () => {
    expect(isFollowUpVisible(followUp, null)).toBe(true);
    expect(
      isFollowUpVisible(followUp, { userId: "user-1", memberId: null }),
    ).toBe(true);
    expect(
      isFollowUpVisible(followUp, { userId: "user-9", memberId: "member-2" }),
    ).toBe(true);
    expect(
      isFollowUpVisible(followUp, { userId: "user-9", memberId: "member-9" }),
    ).toBe(false);
  });
});

describe("Daily reminders (ADR CM-0040 §8)", () => {
  const open = {
    status: "open" as const,
    dueDate: TODAY,
    dueNotifiedOn: null,
    overdueNotifiedAt: null,
  };

  it("sends a due notice once on the day, and an overdue notice once", () => {
    expect(reminderDue(open, TODAY)).toBe("due");
    expect(reminderDue({ ...open, dueNotifiedOn: TODAY }, TODAY)).toBeNull();
    // The day after, it is overdue, whatever the due notice did.
    expect(reminderDue({ ...open, dueNotifiedOn: TODAY }, "2026-11-13")).toBe(
      "overdue",
    );
    expect(
      reminderDue({ ...open, overdueNotifiedAt: new Date() }, "2026-11-13"),
    ).toBeNull();
    expect(reminderDue({ ...open, status: "done" }, TODAY)).toBeNull();
    expect(reminderDue({ ...open, dueDate: "2026-11-14" }, TODAY)).toBeNull();
  });
});
