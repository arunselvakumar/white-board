import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { Department } from "./department";

const NOW = new Date("2026-11-25T10:00:00Z");

function made(name = "Accounts") {
  return Department.create({
    id: "00000000-0000-7000-8000-000000000001",
    workspaceId: "w1",
    name,
    by: "u1",
    now: NOW,
  });
}

function codeOf(run: () => void): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe("Department (ADR CM-0049)", () => {
  it("tidies the name and refuses a blank or long one", () => {
    expect(made("  Accounts   Team ").name).toBe("Accounts Team");
    expect(codeOf(() => made("  "))).toBe("DEPARTMENT_NAME_REQUIRED");
    expect(codeOf(() => made("x".repeat(101)))).toBe(
      "DEPARTMENT_NAME_TOO_LONG",
    );
  });

  it("seeds Human Resources and Marketing as system departments", () => {
    const seeded = Department.systemSet({
      workspaceId: "w1",
      by: "u1",
      now: NOW,
    });
    expect(seeded.map((item) => [item.name, item.isSystem])).toEqual([
      ["Human Resources", true],
      ["Marketing", true],
    ]);
    expect(new Set(seeded.map((item) => item.id)).size).toBe(2);
  });

  it("renames and deletes a Company-made department", () => {
    const department = made();
    const later = new Date("2026-11-25T11:00:00Z");
    department.rename({ name: "Books", by: "u2", now: later });
    expect(department.name).toBe("Books");
    expect(department.updatedBy).toBe("u2");
    department.delete("u3", later);
    expect(department.deletedAt).toEqual(later);
    expect(department.deletedBy).toBe("u3");
  });

  it("keeps a system department's name and never deletes it", () => {
    const [humanResources] = Department.systemSet({
      workspaceId: "w1",
      by: "u1",
      now: NOW,
    });
    if (humanResources == null) throw new Error("No Human Resources");
    expect(
      codeOf(() => {
        humanResources.rename({ name: "People", by: "u2", now: NOW });
      }),
    ).toBe("DEPARTMENT_SYSTEM_LOCKED");
    expect(
      codeOf(() => {
        humanResources.delete("u2", NOW);
      }),
    ).toBe("DEPARTMENT_IS_SYSTEM");
    expect(humanResources.name).toBe("Human Resources");
    expect(humanResources.deletedAt).toBeNull();
  });
});
