import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertCanDeleteUpdate,
  assertEditable,
  assertTransition,
  canDeleteUpdate,
  canTransition,
  issueFields,
  issueStatus,
  reopenReason,
  storedStatusOf,
  updateBody,
  type IssueInput,
} from "./issue";

const TODAY = "2026-10-14";

function refusal(fn: () => unknown): {
  code: string;
  kind: string;
  field: unknown;
} {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        kind: error.kind,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("expected a refusal");
}

const input = (patch: Partial<IssueInput> = {}): IssueInput => ({
  issueDate: "2026-10-10",
  details: "  Plaster cracks on the east wall  ",
  ...patch,
});

describe("issueStatus (CM-0019 §7)", () => {
  it("derives Delayed from an open issue past its Due Date", () => {
    expect(issueStatus({ status: "open", dueDate: "2026-10-13" }, TODAY)).toBe(
      "delayed",
    );
    expect(issueStatus({ status: "open", dueDate: TODAY }, TODAY)).toBe(
      "pending",
    );
    expect(issueStatus({ status: "open", dueDate: "2026-10-20" }, TODAY)).toBe(
      "pending",
    );
    expect(issueStatus({ status: "open", dueDate: null }, TODAY)).toBe(
      "pending",
    );
  });

  it("never delays a solved or closed issue", () => {
    expect(
      issueStatus({ status: "solved", dueDate: "2026-01-01" }, TODAY),
    ).toBe("solved");
    expect(
      issueStatus({ status: "closed", dueDate: "2026-01-01" }, TODAY),
    ).toBe("closed");
  });

  it("filters Pending and Delayed on the stored open status", () => {
    expect(storedStatusOf("pending")).toBe("open");
    expect(storedStatusOf("delayed")).toBe("open");
    expect(storedStatusOf("solved")).toBe("solved");
    expect(storedStatusOf("closed")).toBe("closed");
  });
});

describe("issueFields", () => {
  it("trims the details and keeps the dates", () => {
    expect(
      issueFields(input({ priority: "high", dueDate: "2026-10-20" }), TODAY),
    ).toEqual({
      issueDate: "2026-10-10",
      details: "Plaster cracks on the east wall",
      priority: "high",
      dueDate: "2026-10-20",
    });
    expect(issueFields(input({ priority: "", dueDate: "" }), TODAY)).toEqual(
      expect.objectContaining({ priority: null, dueDate: null }),
    );
  });

  it("refuses missing details, a bad priority and a future Issue Date", () => {
    expect(refusal(() => issueFields(input({ details: "  " }), TODAY))).toEqual(
      { code: "ISSUE_DETAILS_REQUIRED", kind: "invalid", field: "details" },
    );
    expect(
      refusal(() => issueFields(input({ priority: "urgent" }), TODAY)),
    ).toMatchObject({ code: "ISSUE_PRIORITY_INVALID", field: "priority" });
    expect(
      refusal(() => issueFields(input({ issueDate: "2026-10-15" }), TODAY)),
    ).toMatchObject({ code: "ISSUE_DATE_IN_FUTURE", field: "issueDate" });
    expect(
      refusal(() => issueFields(input({ issueDate: "" }), TODAY)),
    ).toMatchObject({ code: "ISSUE_DATE_REQUIRED", field: "issueDate" });
    expect(
      refusal(() => issueFields(input({ dueDate: "2026-02-30" }), TODAY)),
    ).toMatchObject({ code: "ISSUE_DATE_INVALID", field: "dueDate" });
    expect(
      refusal(() => issueFields(input({ details: "x".repeat(4001) }), TODAY)),
    ).toMatchObject({ code: "TEXT_TOO_LONG", field: "details" });
  });

  it("needs the Due Date on or after the Issue Date", () => {
    expect(
      refusal(() => issueFields(input({ dueDate: "2026-10-09" }), TODAY)),
    ).toMatchObject({ code: "ISSUE_DUE_BEFORE_ISSUE_DATE", field: "dueDate" });
    expect(issueFields(input({ dueDate: "2026-10-10" }), TODAY).dueDate).toBe(
      "2026-10-10",
    );
  });
});

describe("transitions (CM-0019 §8)", () => {
  it("solves open, verifies solved and reopens solved or closed", () => {
    expect(canTransition("open", "solve")).toBe(true);
    expect(canTransition("solved", "solve")).toBe(false);
    expect(canTransition("closed", "solve")).toBe(false);
    expect(canTransition("solved", "verify")).toBe(true);
    expect(canTransition("open", "verify")).toBe(false);
    expect(canTransition("closed", "verify")).toBe(false);
    expect(canTransition("solved", "reopen")).toBe(true);
    expect(canTransition("closed", "reopen")).toBe(true);
    expect(canTransition("open", "reopen")).toBe(false);
  });

  it("refuses the rest with a 409", () => {
    expect(
      refusal(() => {
        assertTransition("solved", "solve");
      }),
    ).toMatchObject({
      code: "ISSUE_NOT_OPEN",
      kind: "conflict",
    });
    expect(
      refusal(() => {
        assertTransition("open", "verify");
      }),
    ).toMatchObject({
      code: "ISSUE_NOT_SOLVED",
      kind: "conflict",
    });
    expect(
      refusal(() => {
        assertTransition("open", "reopen");
      }),
    ).toMatchObject({
      code: "ISSUE_NOT_RESOLVED",
      kind: "conflict",
    });
    expect(
      refusal(() => {
        assertEditable("closed");
      }),
    ).toMatchObject({
      code: "ISSUE_NOT_OPEN",
      kind: "conflict",
    });
    expect(() => {
      assertEditable("open");
    }).not.toThrow();
  });

  it("needs a reason to reopen", () => {
    expect(reopenReason("  Cracks came back  ")).toBe("Cracks came back");
    expect(refusal(() => reopenReason(" "))).toMatchObject({
      code: "ISSUE_REOPEN_REASON_REQUIRED",
      field: "reason",
    });
  });
});

describe("the Progress thread", () => {
  it("takes a comment, images, or both", () => {
    expect(updateBody(" Fixed the joint ", false)).toBe("Fixed the joint");
    expect(updateBody("", true)).toBeNull();
    expect(refusal(() => updateBody("  ", false))).toMatchObject({
      code: "ISSUE_UPDATE_EMPTY",
      field: "body",
    });
  });

  it("lets the author delete their own update within 24 hours", () => {
    const createdAt = new Date("2026-10-14T06:00:00Z");
    const update = { createdBy: "user-a", createdAt };
    const soon = new Date("2026-10-15T05:59:59Z");
    const late = new Date("2026-10-15T06:00:00Z");
    expect(canDeleteUpdate(update, "user-a", soon)).toBe(true);
    expect(canDeleteUpdate(update, "user-a", late)).toBe(false);
    expect(canDeleteUpdate(update, "user-b", soon)).toBe(false);
    expect(
      refusal(() => {
        assertCanDeleteUpdate(update, "user-b", soon);
      }),
    ).toMatchObject({ code: "ISSUE_UPDATE_NOT_YOURS", kind: "forbidden" });
    expect(
      refusal(() => {
        assertCanDeleteUpdate(update, "user-a", late);
      }),
    ).toMatchObject({ code: "ISSUE_UPDATE_TOO_OLD", kind: "conflict" });
  });
});
