import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { followUpFields, inquiryTaskFields } from "./follow-up";

const ZONE = "Asia/Kolkata";
// 17 Oct 2026, 15:00 in India.
const NOW = new Date("2026-10-17T09:30:00Z");

function code(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "other";
  }
}

describe("follow-ups (CM-0022 §4)", () => {
  const base = {
    activity: "call" as const,
    doneOn: { date: "2026-10-17", time: "14:30" },
  };

  it("keeps Done on as an instant and the next follow-up after it", () => {
    const fields = followUpFields(
      {
        ...base,
        remarks: "  Called ",
        nextFollowUp: { date: "2026-10-17", time: null },
      },
      NOW,
      ZONE,
    );
    expect(fields.doneAt.toISOString()).toBe("2026-10-17T09:00:00.000Z");
    expect(fields.remarks).toBe("Called");
    expect(fields.next?.hasTime).toBe(false);
  });

  it("refuses Done on in the future and a next follow-up before it", () => {
    expect(
      code(() =>
        followUpFields(
          { ...base, doneOn: { date: "2026-10-17", time: "15:30" } },
          NOW,
          ZONE,
        ),
      ),
    ).toBe("FOLLOW_UP_IN_FUTURE");
    expect(
      code(() =>
        followUpFields(
          { ...base, nextFollowUp: { date: "2026-10-17", time: "14:00" } },
          NOW,
          ZONE,
        ),
      ),
    ).toBe("NEXT_FOLLOW_UP_BEFORE_DONE");
    expect(
      code(() =>
        followUpFields(
          { ...base, nextFollowUp: { date: "2026-10-16", time: null } },
          NOW,
          ZONE,
        ),
      ),
    ).toBe("NEXT_FOLLOW_UP_BEFORE_DONE");
  });
});

describe("Inquiry Tasks (CM-0022 §5)", () => {
  it("needs a title of at most 200 characters", () => {
    expect(inquiryTaskFields({ title: " Send  brochure " }).title).toBe(
      "Send brochure",
    );
    expect(code(() => inquiryTaskFields({ title: "" }))).toBe(
      "INQUIRY_TASK_TITLE_REQUIRED",
    );
    expect(code(() => inquiryTaskFields({ title: "x".repeat(201) }))).toBe(
      "INQUIRY_TASK_TITLE_TOO_LONG",
    );
  });
});
