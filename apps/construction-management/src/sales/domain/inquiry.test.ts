import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  canTransitionInquiry,
  followUpDue,
  inquiryFields,
  inquiryTransition,
} from "./inquiry";
import { dueBounds, salesInstant, salesLocal } from "./sales-time";

const TODAY = "2026-10-17";
const ZONE = "Asia/Kolkata";

function code(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "other";
  }
}

describe("inquiry fields (CM-1003)", () => {
  it("normalises the mobile and keeps the email as typed", () => {
    const fields = inquiryFields(
      { name: " Ravi  Kumar ", mobile: "098450-12345", email: "Ravi@X.com" },
      TODAY,
    );
    expect(fields).toMatchObject({
      name: "Ravi Kumar",
      mobile: "+919845012345",
      email: "Ravi@X.com",
      inquiryDate: TODAY,
      nextFollowUp: null,
    });
  });

  it("refuses what CM-0022 §3 refuses", () => {
    expect(code(() => inquiryFields({ name: "" }, TODAY))).toBe(
      "INQUIRY_NAME_REQUIRED",
    );
    expect(code(() => inquiryFields({ name: "A", mobile: "555" }, TODAY))).toBe(
      "INQUIRY_MOBILE_INVALID",
    );
    expect(code(() => inquiryFields({ name: "A", email: "a@b" }, TODAY))).toBe(
      "INQUIRY_EMAIL_INVALID",
    );
    expect(
      code(() =>
        inquiryFields({ name: "A", inquiryDate: "2026-10-18" }, TODAY),
      ),
    ).toBe("INQUIRY_DATE_IN_FUTURE");
    expect(
      code(() =>
        inquiryFields(
          { name: "A", nextFollowUp: { date: TODAY, time: "25:00" } },
          TODAY,
        ),
      ),
    ).toBe("TIME_INVALID");
  });
});

describe("inquiry status (CM-0022 §6)", () => {
  it("closes an Open inquiry and reopens a closed one", () => {
    expect(inquiryTransition("open", "convert")).toBe("converted");
    expect(inquiryTransition("open", "lose")).toBe("lost");
    expect(inquiryTransition("lost", "reopen")).toBe("open");
    expect(canTransitionInquiry("converted", "lose")).toBe(false);
    expect(code(() => inquiryTransition("lost", "convert"))).toBe(
      "INQUIRY_NOT_OPEN",
    );
    expect(code(() => inquiryTransition("open", "reopen"))).toBe(
      "INQUIRY_NOT_CLOSED",
    );
  });
});

describe("Due (CM-0022 §4)", () => {
  // 17 Oct, 15:00 in India.
  const now = new Date("2026-10-17T09:30:00Z");
  const bounds = dueBounds(now, TODAY, ZONE);
  const at = (date: string, time: string | null) => ({
    at: salesInstant(date, time, ZONE),
    hasTime: time != null,
  });

  it("is Overdue before now, Today later today, Upcoming from tomorrow", () => {
    expect(followUpDue("open", null, bounds)).toBe("none");
    expect(followUpDue("open", at("2026-10-16", null), bounds)).toBe("overdue");
    expect(followUpDue("open", at(TODAY, "14:59"), bounds)).toBe("overdue");
    expect(followUpDue("open", at(TODAY, "15:01"), bounds)).toBe("today");
    expect(followUpDue("open", at(TODAY, null), bounds)).toBe("today");
    expect(followUpDue("open", at("2026-10-18", "00:00"), bounds)).toBe(
      "upcoming",
    );
    expect(followUpDue("lost", at("2026-10-16", null), bounds)).toBeNull();
  });

  it("reads the Company's wall clock back", () => {
    const instant = salesInstant(TODAY, "10:30", ZONE);
    expect(instant.toISOString()).toBe("2026-10-17T05:00:00.000Z");
    expect(salesLocal(instant, ZONE)).toEqual({ date: TODAY, time: "10:30" });
  });

  it("keeps a day on its date where daylight saving starts at midnight", () => {
    const santiago = "America/Santiago";
    const start = salesInstant("2026-09-06", null, santiago);
    expect(salesLocal(start, santiago)).toEqual({
      date: "2026-09-06",
      time: "01:00",
    });
    const day = dueBounds(start, "2026-09-06", santiago);
    expect(day.todayStart.toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(day.tomorrowStart.toISOString()).toBe("2026-09-07T03:00:00.000Z");
    // A skipped 02:30 in New York is 03:00.
    const newYork = "America/New_York";
    expect(
      salesLocal(salesInstant("2026-03-08", "02:30", newYork), newYork),
    ).toEqual({ date: "2026-03-08", time: "03:00" });
  });
});
