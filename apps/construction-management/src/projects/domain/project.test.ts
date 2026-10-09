import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  Project,
  compareProjects,
  projectDetails,
  type ProjectDetailsInput,
} from "./project";

const NOW = new Date("2026-10-08T00:00:00Z");
const LATER = new Date("2026-10-09T00:00:00Z");

function project(details: Partial<ProjectDetailsInput> = {}) {
  return Project.create({
    id: "p1",
    workspaceId: "company-1",
    details: { name: "Shanti Heights", ...details },
    by: "user-1",
    now: NOW,
  });
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof DomainError ? error.code : "not a DomainError";
  }
  return undefined;
}

describe("Project", () => {
  it("starts Ongoing with only a name", () => {
    expect(project().details).toEqual({
      name: "Shanti Heights",
      status: "ongoing",
      address: null,
      startDate: null,
      endDate: null,
    });
  });

  it("needs a name of at most 120 characters, spaces tidied", () => {
    expect(codeOf(() => project({ name: "   " }))).toBe(
      "PROJECT_NAME_REQUIRED",
    );
    expect(codeOf(() => project({ name: "x".repeat(121) }))).toBe(
      "PROJECT_NAME_TOO_LONG",
    );
    expect(project({ name: "  Shanti   Heights " }).name).toBe(
      "Shanti Heights",
    );
    expect(project({ name: "x".repeat(120) }).name).toHaveLength(120);
  });

  it("keeps an address of at most 500 characters; blank is none", () => {
    expect(project({ address: "  Plot 12, Baner, Pune " }).address).toBe(
      "Plot 12, Baner, Pune",
    );
    expect(project({ address: "   " }).address).toBeNull();
    expect(codeOf(() => project({ address: "a".repeat(501) }))).toBe(
      "PROJECT_ADDRESS_TOO_LONG",
    );
  });

  it("accepts only the four statuses", () => {
    expect(project({ status: "on_hold" }).status).toBe("on_hold");
    expect(codeOf(() => project({ status: "cancelled" }))).toBe(
      "PROJECT_STATUS_INVALID",
    );
  });

  it("refuses an end date before the start date", () => {
    expect(
      codeOf(() =>
        projectDetails({
          name: "A",
          startDate: "2026-10-08",
          endDate: "2026-10-07",
        }),
      ),
    ).toBe("PROJECT_DATES_INVALID");
    expect(
      projectDetails({
        name: "A",
        startDate: "2026-10-08",
        endDate: "2026-10-08",
      }),
    ).toMatchObject({ startDate: "2026-10-08", endDate: "2026-10-08" });
    // Either date alone is fine.
    expect(projectDetails({ name: "A", endDate: "2027-03-31" }).endDate).toBe(
      "2027-03-31",
    );
  });

  it("refuses a date that is not a calendar date", () => {
    expect(codeOf(() => project({ startDate: "2026-02-30" }))).toBe(
      "PROJECT_DATE_INVALID",
    );
    expect(codeOf(() => project({ endDate: "08/10/2026" }))).toBe(
      "PROJECT_DATE_INVALID",
    );
    expect(project({ startDate: "" }).startDate).toBeNull();
  });

  it("updates every field and stamps who and when", () => {
    const item = project();
    item.update(
      {
        name: "Shanti Heights Phase 2",
        status: "completed",
        address: "Baner",
        startDate: "2025-04-01",
        endDate: "2026-09-30",
      },
      "user-2",
      LATER,
    );
    expect(item.details).toEqual({
      name: "Shanti Heights Phase 2",
      status: "completed",
      address: "Baner",
      startDate: "2025-04-01",
      endDate: "2026-09-30",
    });
    expect(item.updatedBy).toBe("user-2");
    expect(item.updatedAt).toEqual(LATER);
    expect(item.createdAt).toEqual(NOW);
  });

  it("is deleted once", () => {
    const item = project();
    item.delete("user-2", LATER);
    expect(item.deletedAt).toEqual(LATER);
    expect(
      codeOf(() => {
        item.delete("user-2", LATER);
      }),
    ).toBe("PROJECT_NOT_FOUND");
  });

  it("orders by status (Ongoing, Not started, On hold, Completed), then name", () => {
    const items = [
      { status: "completed" as const, name: "Alpha" },
      { status: "ongoing" as const, name: "tower 10" },
      { status: "on_hold" as const, name: "Beta" },
      { status: "ongoing" as const, name: "Tower 9" },
      { status: "not_started" as const, name: "Gamma" },
    ];
    expect(items.sort(compareProjects).map((item) => item.name)).toEqual([
      "Tower 9",
      "tower 10",
      "Gamma",
      "Beta",
      "Alpha",
    ]);
  });
});
