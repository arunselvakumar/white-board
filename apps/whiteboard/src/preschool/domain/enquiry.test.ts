import { describe, expect, it } from "vitest";

import {
  assertCanAdmitEnquiry,
  assertCanMarkLost,
  assertCanReopen,
  assertEnquiryEditable,
  assertEnquiryOpen,
  isFollowUpDue,
  moveEnquiry,
  statusBeforeLost,
} from "./enquiry";
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

const TODAY = "2026-11-25";

describe("isFollowUpDue", () => {
  it("is due for an open Enquiry with a follow-up today or earlier", () => {
    expect(isFollowUpDue({ status: "new", nextFollowUpOn: TODAY }, TODAY)).toBe(
      true,
    );
    expect(
      isFollowUpDue({ status: "visited", nextFollowUpOn: "2026-11-01" }, TODAY),
    ).toBe(true);
  });

  it("is not due later, without a date, or once closed", () => {
    expect(
      isFollowUpDue({ status: "new", nextFollowUpOn: "2026-11-26" }, TODAY),
    ).toBe(false);
    expect(isFollowUpDue({ status: "new", nextFollowUpOn: null }, TODAY)).toBe(
      false,
    );
    expect(
      isFollowUpDue({ status: "lost", nextFollowUpOn: "2026-11-01" }, TODAY),
    ).toBe(false);
    expect(
      isFollowUpDue({ status: "admitted", nextFollowUpOn: TODAY }, TODAY),
    ).toBe(false);
  });
});

describe("moveEnquiry", () => {
  it("needs a date to schedule a visit", () => {
    expect(
      codeOf(() =>
        moveEnquiry(
          { status: "new", visitOn: null },
          "visit_scheduled",
          {},
          TODAY,
        ),
      ),
    ).toBe("VISIT_DATE_REQUIRED");
    expect(
      moveEnquiry(
        { status: "contacted", visitOn: null },
        "visit_scheduled",
        { visitOn: "2026-11-28" },
        TODAY,
      ),
    ).toEqual({ status: "visit_scheduled", visitOn: "2026-11-28" });
  });

  it("lets a scheduled visit be moved to another date but not the same one", () => {
    const scheduled = {
      status: "visit_scheduled" as const,
      visitOn: "2026-11-28",
    };
    expect(
      moveEnquiry(
        scheduled,
        "visit_scheduled",
        { visitOn: "2026-11-30" },
        TODAY,
      ).visitOn,
    ).toBe("2026-11-30");
    expect(
      codeOf(() =>
        moveEnquiry(
          scheduled,
          "visit_scheduled",
          { visitOn: "2026-11-28" },
          TODAY,
        ),
      ),
    ).toBe("ENQUIRY_STATUS_UNCHANGED");
  });

  it("marks a visit on its past date, else today", () => {
    expect(
      moveEnquiry(
        { status: "visit_scheduled", visitOn: "2026-11-20" },
        "visited",
        {},
        TODAY,
      ).visitOn,
    ).toBe("2026-11-20");
    expect(
      moveEnquiry(
        { status: "visit_scheduled", visitOn: "2026-12-01" },
        "visited",
        {},
        TODAY,
      ).visitOn,
    ).toBe(TODAY);
  });

  it("refuses the same status and closed Enquiries", () => {
    expect(
      codeOf(() =>
        moveEnquiry(
          { status: "contacted", visitOn: null },
          "contacted",
          {},
          TODAY,
        ),
      ),
    ).toBe("ENQUIRY_STATUS_UNCHANGED");
    expect(
      codeOf(() =>
        moveEnquiry({ status: "lost", visitOn: null }, "contacted", {}, TODAY),
      ),
    ).toBe("ENQUIRY_LOST");
    expect(
      codeOf(() =>
        moveEnquiry(
          { status: "admitted", visitOn: null },
          "contacted",
          {},
          TODAY,
        ),
      ),
    ).toBe("ENQUIRY_ADMITTED");
  });
});

describe("closed Enquiries", () => {
  it("are never edited once admitted", () => {
    expect(codeOf(() => assertEnquiryEditable("admitted"))).toBe(
      "ENQUIRY_ADMITTED",
    );
    expect(codeOf(() => assertEnquiryEditable("lost"))).toBeNull();
    expect(codeOf(() => assertEnquiryOpen("lost"))).toBe("ENQUIRY_LOST");
  });

  it("are marked lost once and reopened only from lost", () => {
    expect(codeOf(() => assertCanMarkLost("visited"))).toBeNull();
    expect(codeOf(() => assertCanMarkLost("lost"))).toBe("ENQUIRY_LOST");
    expect(codeOf(() => assertCanReopen("lost"))).toBeNull();
    expect(codeOf(() => assertCanReopen("new"))).toBe("ENQUIRY_NOT_LOST");
    expect(codeOf(() => assertCanReopen("admitted"))).toBe("ENQUIRY_ADMITTED");
  });

  it("become an Admission only while open and in the same Centre", () => {
    expect(
      codeOf(() =>
        assertCanAdmitEnquiry({ status: "visited", centreId: "a" }, "a"),
      ),
    ).toBeNull();
    expect(
      codeOf(() =>
        assertCanAdmitEnquiry({ status: "new", centreId: "a" }, "b"),
      ),
    ).toBe("ENQUIRY_OTHER_CENTRE");
    expect(
      codeOf(() =>
        assertCanAdmitEnquiry({ status: "admitted", centreId: "a" }, "a"),
      ),
    ).toBe("ENQUIRY_ALREADY_ADMITTED");
    expect(
      codeOf(() =>
        assertCanAdmitEnquiry({ status: "lost", centreId: "a" }, "a"),
      ),
    ).toBe("ENQUIRY_LOST");
  });
});

describe("statusBeforeLost", () => {
  it("goes back to the open status the Enquiry had when it was lost", () => {
    expect(
      statusBeforeLost([
        { toStatus: "lost" },
        { toStatus: null },
        { toStatus: "visited" },
        { toStatus: "contacted" },
        { toStatus: "new" },
      ]),
    ).toBe("visited");
  });

  it("uses the latest loss after an earlier reopen", () => {
    expect(
      statusBeforeLost([
        { toStatus: "lost" },
        { toStatus: "contacted" },
        { toStatus: "lost" },
        { toStatus: "visited" },
      ]),
    ).toBe("contacted");
  });

  it("falls back to New", () => {
    expect(statusBeforeLost([{ toStatus: "lost" }])).toBe("new");
    expect(statusBeforeLost([])).toBe("new");
  });
});
