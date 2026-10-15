import { describe, expect, it } from "vitest";

import { pendingState } from "@/src/shared-kernel/approval";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertPending,
  assertReinspectable,
  decideInspection,
  inspectionFields,
  inspectionTime,
  observationBody,
  reinspectionDraft,
  remarkBody,
  snagDetails,
  successRate,
} from "./inspection";

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

const by = { userId: "user-1", at: new Date("2026-10-14T05:00:00Z") };

describe("inspectionFields (CM-804)", () => {
  it("trims, drops empty ids and repeated drawings", () => {
    expect(
      inspectionFields({
        inspectionDate: "2026-10-15",
        inspectionTime: " 09:30 ",
        departmentId: "",
        contractorId: " c-1 ",
        inspectorMemberId: null,
        workDescription: "  Slab reinforcement  ",
        drawingIds: ["d-1", "d-1", " ", "d-2"],
      }),
    ).toEqual({
      inspectionDate: "2026-10-15",
      inspectionTime: "09:30",
      departmentId: null,
      contractorId: "c-1",
      inspectorMemberId: null,
      workDescription: "Slab reinforcement",
      drawingIds: ["d-1", "d-2"],
    });
  });

  it("needs a real date and a description", () => {
    expect(
      code(() =>
        inspectionFields({
          inspectionDate: "2026-02-30",
          workDescription: "x",
        }),
      ),
    ).toBe("INSPECTION_DATE_INVALID");
    expect(
      code(() =>
        inspectionFields({
          inspectionDate: "2026-10-14",
          workDescription: " ",
        }),
      ),
    ).toBe("INSPECTION_DESCRIPTION_REQUIRED");
    expect(
      code(() =>
        inspectionFields({
          inspectionDate: "2026-10-14",
          workDescription: "x".repeat(2001),
        }),
      ),
    ).toBe("TEXT_TOO_LONG");
  });

  it("caps linked drawings at 50", () => {
    expect(
      code(() =>
        inspectionFields({
          inspectionDate: "2026-10-14",
          workDescription: "Columns",
          drawingIds: Array.from({ length: 51 }, (_, i) => `d-${String(i)}`),
        }),
      ),
    ).toBe("INSPECTION_TOO_MANY_DRAWINGS");
  });
});

describe("inspectionTime", () => {
  it("takes HH:MM in 24 hours, or nothing", () => {
    expect(inspectionTime("00:00")).toBe("00:00");
    expect(inspectionTime("23:59")).toBe("23:59");
    expect(inspectionTime("")).toBeNull();
    expect(inspectionTime(null)).toBeNull();
    for (const bad of ["24:00", "12:60", "9:30", "0930", "noon"])
      expect(code(() => inspectionTime(bad))).toBe("INSPECTION_TIME_INVALID");
  });
});

describe("decisions", () => {
  it("approves or rejects a pending request once", () => {
    const approved = decideInspection(pendingState(), { approve: true }, by);
    expect(approved).toMatchObject({
      status: "approved",
      decidedBy: "user-1",
      rejectionReason: null,
    });
    expect(
      code(() =>
        decideInspection(approved, { approve: false, reason: "No" }, by),
      ),
    ).toBe("INSPECTION_NOT_PENDING");
    const rejected = decideInspection(
      pendingState(),
      { approve: false, reason: "  Cover blocks missing " },
      by,
    );
    expect(rejected).toMatchObject({
      status: "rejected",
      rejectionReason: "Cover blocks missing",
    });
  });

  it("needs a reason to reject", () => {
    expect(
      code(() =>
        decideInspection(pendingState(), { approve: false, reason: " " }, by),
      ),
    ).toBe("REJECTION_REASON_REQUIRED");
  });

  it("keeps a decided request read-only", () => {
    expect(
      code(() => {
        assertPending("pending", "edit");
      }),
    ).toBeUndefined();
    for (const what of ["edit", "delete", "observe"] as const) {
      expect(
        code(() => {
          assertPending("approved", what);
        }),
      ).toBe("INSPECTION_DECIDED");
      expect(
        code(() => {
          assertPending("rejected", what);
        }),
      ).toBe("INSPECTION_DECIDED");
    }
  });
});

describe("observations and remarks", () => {
  it("needs text unless files come with it", () => {
    expect(observationBody(" Cover 20 mm ", false)).toBe("Cover 20 mm");
    expect(observationBody("", true)).toBeNull();
    expect(code(() => observationBody(" ", false))).toBe("OBSERVATION_EMPTY");
    expect(code(() => observationBody("x".repeat(2001), true))).toBe(
      "TEXT_TOO_LONG",
    );
  });

  it("needs a remark's text, up to 500", () => {
    expect(remarkBody(" Checked again ")).toBe("Checked again");
    expect(code(() => remarkBody(""))).toBe("REMARK_EMPTY");
    expect(code(() => remarkBody("x".repeat(501)))).toBe("TEXT_TOO_LONG");
  });
});

describe("re-inspection", () => {
  it("is raised only from a rejected request of the same Project", () => {
    expect(
      code(() => {
        assertReinspectable({ status: "rejected", projectId: "p" }, "p");
      }),
    ).toBeUndefined();
    expect(
      code(() => {
        assertReinspectable({ status: "approved", projectId: "p" }, "p");
      }),
    ).toBe("INSPECTION_NOT_REJECTED");
    expect(
      code(() => {
        assertReinspectable({ status: "pending", projectId: "p" }, "p");
      }),
    ).toBe("INSPECTION_NOT_REJECTED");
    expect(
      code(() => {
        assertReinspectable({ status: "rejected", projectId: "q" }, "p");
      }),
    ).toBe("REINSPECTION_PROJECT_MISMATCH");
  });

  it("copies what is inspected again, not the date or files", () => {
    const draft = reinspectionDraft({
      id: "ir-1",
      departmentId: "dep",
      contractorId: "con",
      inspectorMemberId: "mem",
      workDescription: "Column C4 reinforcement",
      siteLocation: { type: "location", locationId: "loc" },
      drawingIds: ["d-1"],
    });
    expect(draft).toEqual({
      reinspectionOfId: "ir-1",
      departmentId: "dep",
      contractorId: "con",
      inspectorMemberId: "mem",
      workDescription: "Column C4 reinforcement",
      siteLocation: { type: "location", locationId: "loc" },
      drawingIds: ["d-1"],
    });
  });

  it("words the snag after the request and the reason", () => {
    expect(snagDetails("IR/26-27/00007", "Cover blocks missing")).toBe(
      "Inspection IR/26-27/00007 rejected: Cover blocks missing",
    );
  });
});

describe("successRate", () => {
  it("is approved over decided, as a percentage", () => {
    expect(successRate(3, 1)).toBe(75);
    expect(successRate(1, 0)).toBe(100);
    expect(successRate(0, 2)).toBe(0);
    expect(successRate(1, 2)).toBeCloseTo(33.333, 2);
  });

  it("is null with no decided request", () => {
    expect(successRate(0, 0)).toBeNull();
  });
});
