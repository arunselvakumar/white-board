import { describe, expect, it } from "vitest";

import {
  Enquiry,
  enquiryDetails,
  enquiryStage,
  isFollowUpDue,
  type EnquiryAction,
} from "./enquiry";

const now = new Date("2026-11-02T04:30:00.000Z");
let counter = 0;
function action(today = "2026-11-02"): EnquiryAction {
  counter += 1;
  return {
    userId: "user_owner",
    now,
    today,
    activityId: `activity-${counter}`,
  };
}

const details = enquiryDetails({
  prospectName: "  Meena  ",
  phone: " 98765 43210 ",
  guardianName: " ",
  subject: "Class 10 Maths",
  preferredClassMode: "offline",
});

function record(nextFollowUpOn: string | null = null): Enquiry {
  return Enquiry.record({
    id: "enquiry-1",
    workspaceId: "org_1",
    details,
    nextFollowUpOn,
    action: action(),
  });
}

function code(work: () => unknown): string | undefined {
  try {
    work();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("enquiryDetails", () => {
  it("trims text and turns blanks into null", () => {
    expect(details).toMatchObject({
      prospectName: "Meena",
      phone: "98765 43210",
      guardianName: null,
      email: null,
      courseId: null,
      subject: "Class 10 Maths",
      preferredClassMode: "offline",
    });
  });

  it("needs a name and phone and checks lengths, email, and Class Mode", () => {
    const base = { prospectName: "Meena", phone: "9876543210" };
    expect(code(() => enquiryDetails({ ...base, prospectName: " " }))).toBe(
      "ENQUIRY_PROSPECT_NAME_INVALID",
    );
    expect(code(() => enquiryDetails({ ...base, phone: " " }))).toBe(
      "ENQUIRY_PHONE_REQUIRED",
    );
    expect(code(() => enquiryDetails({ ...base, email: "nope" }))).toBe(
      "EMAIL_INVALID",
    );
    expect(
      code(() => enquiryDetails({ ...base, notes: "x".repeat(2001) })),
    ).toBe("ENQUIRY_NOTES_TOO_LONG");
    expect(
      code(() => enquiryDetails({ ...base, preferredClassMode: "postal" })),
    ).toBe("CLASS_MODE_INVALID");
  });
});

describe("enquiryStage", () => {
  const none = {
    converted: false,
    notInterested: false,
    demos: [],
    nextFollowUpOn: null,
    hasFollowUp: false,
  };
  const booked = { attendance: "unmarked" as const, cancelled: false };
  const attended = { attendance: "attended" as const, cancelled: false };
  const cancelled = { attendance: "unmarked" as const, cancelled: true };

  it("follows Joined > Not interested > Demo scheduled > Demo attended > Follow-up > New", () => {
    expect(enquiryStage(none)).toBe("new");
    expect(enquiryStage({ ...none, hasFollowUp: true })).toBe("follow_up");
    expect(enquiryStage({ ...none, nextFollowUpOn: "2026-11-03" })).toBe(
      "follow_up",
    );
    expect(
      enquiryStage({ ...none, hasFollowUp: true, demos: [attended] }),
    ).toBe("demo_attended");
    expect(enquiryStage({ ...none, demos: [attended, booked] })).toBe(
      "demo_scheduled",
    );
    expect(
      enquiryStage({ ...none, notInterested: true, demos: [booked] }),
    ).toBe("not_interested");
    expect(
      enquiryStage({ ...none, converted: true, notInterested: true }),
    ).toBe("joined");
  });

  it("ignores cancelled and missed demos", () => {
    expect(enquiryStage({ ...none, demos: [cancelled] })).toBe("new");
    expect(
      enquiryStage({
        ...none,
        demos: [{ attendance: "missed", cancelled: false }],
      }),
    ).toBe("new");
  });
});

describe("isFollowUpDue", () => {
  it("is due when open and the date is today or earlier", () => {
    expect(isFollowUpDue("follow_up", "2026-11-02", "2026-11-02")).toBe(true);
    expect(isFollowUpDue("demo_scheduled", "2026-11-01", "2026-11-02")).toBe(
      true,
    );
    expect(isFollowUpDue("follow_up", "2026-11-03", "2026-11-02")).toBe(false);
    expect(isFollowUpDue("new", null, "2026-11-02")).toBe(false);
    expect(isFollowUpDue("not_interested", "2026-11-01", "2026-11-02")).toBe(
      false,
    );
    expect(isFollowUpDue("joined", "2026-11-01", "2026-11-02")).toBe(false);
  });
});

describe("Enquiry", () => {
  it("records a New Enquiry with a created history entry", () => {
    const enquiry = record();
    expect(enquiry.stage).toBe("new");
    expect(enquiry.pullActivities()).toMatchObject([
      { kind: "created", note: null, nextFollowUpOn: null },
    ]);
    expect(enquiry.pullActivities()).toEqual([]);
  });

  it("starts at Follow-up with a next follow-up date, never in the past", () => {
    expect(record("2026-11-03").stage).toBe("follow_up");
    expect(record("2026-11-02").nextFollowUpOn).toBe("2026-11-02");
    expect(code(() => record("2026-11-01"))).toBe("FOLLOW_UP_IN_PAST");
    expect(code(() => record("2026-02-30"))).toBe("FOLLOW_UP_DATE_INVALID");
  });

  it("logs a follow-up note and sets or clears the next date", () => {
    const enquiry = record("2026-11-05");
    enquiry.logFollowUp(
      { note: "  Called, will visit  ", nextFollowUpOn: null },
      action(),
    );
    expect(enquiry.nextFollowUpOn).toBeNull();
    expect(enquiry.stage).toBe("follow_up");
    expect(enquiry.pullActivities().at(-1)).toMatchObject({
      kind: "follow_up",
      note: "Called, will visit",
      nextFollowUpOn: null,
    });
    expect(
      code(() => {
        enquiry.logFollowUp({ note: " ", nextFollowUpOn: null }, action());
      }),
    ).toBe("FOLLOW_UP_NOTE_INVALID");
    expect(
      code(() => {
        enquiry.logFollowUp(
          { note: "Call", nextFollowUpOn: "2026-11-01" },
          action(),
        );
      }),
    ).toBe("FOLLOW_UP_IN_PAST");
  });

  it("closes as Not interested with a 1–200 character reason, and reopens", () => {
    const enquiry = record();
    expect(
      code(() => {
        enquiry.markNotInterested("  ", action());
      }),
    ).toBe("NOT_INTERESTED_REASON_INVALID");
    expect(
      code(() => {
        enquiry.markNotInterested("x".repeat(201), action());
      }),
    ).toBe("NOT_INTERESTED_REASON_INVALID");
    enquiry.markNotInterested("  Fees too high ", action());
    expect(enquiry.stage).toBe("not_interested");
    expect(enquiry.toProps().notInterestedReason).toBe("Fees too high");
    expect(
      code(() => {
        enquiry.markNotInterested("Again", action());
      }),
    ).toBe("ENQUIRY_CLOSED");
    expect(
      code(() => {
        enquiry.logFollowUp({ note: "Call", nextFollowUpOn: null }, action());
      }),
    ).toBe("ENQUIRY_CLOSED");
    expect(
      code(() => {
        enquiry.assertCanBookDemo();
      }),
    ).toBe("ENQUIRY_CLOSED");
    expect(
      code(() => {
        enquiry.assertCanConvert();
      }),
    ).toBe("ENQUIRY_CLOSED");

    enquiry.reopen({ nextFollowUpOn: "2026-11-04" }, action());
    expect(enquiry.stage).toBe("follow_up");
    expect(enquiry.toProps().notInterestedReason).toBeNull();
    expect(
      code(() => {
        enquiry.reopen({}, action());
      }),
    ).toBe("ENQUIRY_NOT_CLOSED");
    expect(enquiry.pullActivities().map((entry) => entry.kind)).toEqual([
      "created",
      "not_interested",
      "reopened",
    ]);
  });

  it("can still edit details while Not interested", () => {
    const enquiry = record();
    enquiry.markNotInterested("Moved away", action());
    enquiry.updateDetails({ ...details, prospectName: "Meena R" }, action());
    expect(enquiry.details.prospectName).toBe("Meena R");
  });

  it("joins once, then can't be edited, closed, reopened, or converted again", () => {
    const enquiry = record();
    enquiry.markJoined({ studentId: "s-1", enrollmentId: "e-1" }, action());
    expect(enquiry.stage).toBe("joined");
    expect(enquiry.toProps()).toMatchObject({
      convertedStudentId: "s-1",
      convertedEnrollmentId: "e-1",
    });
    expect(
      code(() => {
        enquiry.markJoined({ studentId: "s-2", enrollmentId: "e-2" }, action());
      }),
    ).toBe("ENQUIRY_ALREADY_CONVERTED");
    expect(
      code(() => {
        enquiry.updateDetails(details, action());
      }),
    ).toBe("ENQUIRY_JOINED");
    expect(
      code(() => {
        enquiry.reopen({}, action());
      }),
    ).toBe("ENQUIRY_JOINED");
    expect(
      code(() => {
        enquiry.markNotInterested("No", action());
      }),
    ).toBe("ENQUIRY_CLOSED");
    expect(
      code(() => {
        enquiry.assertCanBookDemo();
      }),
    ).toBe("ENQUIRY_CLOSED");
  });

  it("restages when its demos change", () => {
    const enquiry = record();
    enquiry.demosChanged([{ attendance: "unmarked", cancelled: false }], now);
    expect(enquiry.stage).toBe("demo_scheduled");
    enquiry.demosChanged([{ attendance: "attended", cancelled: false }], now);
    expect(enquiry.stage).toBe("demo_attended");
    enquiry.demosChanged([{ attendance: "unmarked", cancelled: true }], now);
    expect(enquiry.stage).toBe("new");
  });
});
