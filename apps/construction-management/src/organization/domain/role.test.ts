import { describe, expect, it } from "vitest";

import { PermissionSet } from "@/src/shared-kernel/access";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { Role, changedCells, copyName } from "./role";

const NOW = new Date("2026-10-24T00:00:00Z");

const attendance = PermissionSet.fromGrants({
  "labour.attendance": ["create", "read"],
});

function role(name = "Site Engineer", permissions = attendance) {
  return Role.create({
    id: "r1",
    workspaceId: "company-1",
    name,
    permissions,
    by: "user-1",
    now: NOW,
  });
}

describe("Role", () => {
  it("needs a name of at most 100 characters, tidied", () => {
    expect(() => role("   ")).toThrow(
      expect.objectContaining({ code: "ROLE_NAME_REQUIRED" }) as Error,
    );
    expect(() => role("x".repeat(101))).toThrow(
      expect.objectContaining({ code: "ROLE_NAME_TOO_LONG" }) as Error,
    );
    expect(role("x".repeat(100)).name).toHaveLength(100);
    expect(role("  Site   Engineer ").name).toBe("Site Engineer");
  });

  it("keeps an optional description of at most 300 characters", () => {
    const blank = Role.create({
      id: "r1",
      workspaceId: "company-1",
      name: "Store Keeper",
      description: "   ",
      permissions: PermissionSet.empty(),
      by: "user-1",
      now: NOW,
    });
    expect(blank.description).toBeNull();
    expect(() => {
      blank.update({
        name: "Store Keeper",
        description: "x".repeat(301),
        permissions: PermissionSet.empty(),
        by: "user-1",
        now: NOW,
      });
    }).toThrow(
      expect.objectContaining({ code: "ROLE_DESCRIPTION_TOO_LONG" }) as Error,
    );
  });

  it("drops cells a menu does not support", () => {
    const sanitized = role(
      "Viewer",
      PermissionSet.fromGrants({ "projects.project": ["read", "approve"] }),
    );
    expect(sanitized.permissions.toGrants()).toEqual({
      "projects.project": ["read"],
    });
  });

  it("replaces its whole matrix on update", () => {
    const item = role();
    const later = new Date("2026-10-25T00:00:00Z");
    item.update({
      name: "Senior Site Engineer",
      permissions: PermissionSet.fromGrants({ "tracking.tasks": ["read"] }),
      by: "user-2",
      now: later,
    });
    expect(item).toMatchObject({
      name: "Senior Site Engineer",
      updatedAt: later,
      updatedBy: "user-2",
    });
    expect(item.permissions.toGrants()).toEqual({ "tracking.tasks": ["read"] });
  });

  it("duplicates with the same matrix, as a Company Role", () => {
    const seeded = Role.create({
      id: "r1",
      workspaceId: "company-1",
      name: "Admin",
      permissions: PermissionSet.everything(),
      isSeed: true,
      by: "user-1",
      now: NOW,
    });
    const copy = seeded.duplicate({
      id: "r2",
      name: "Admin (copy)",
      by: "user-1",
      now: NOW,
    });
    expect(copy).toMatchObject({
      id: "r2",
      name: "Admin (copy)",
      isSeed: false,
    });
    expect(copy.permissions.equals(seeded.permissions)).toBe(true);
  });

  it("cannot be deleted twice", () => {
    const item = role();
    item.delete("user-1", NOW);
    expect(() => {
      item.delete("user-1", NOW);
    }).toThrow(DomainError);
  });
});

describe("copyName", () => {
  it("numbers copies after the first and fits the name limit", () => {
    expect(copyName("Store Keeper", new Set())).toBe("Store Keeper (copy)");
    expect(copyName("Store Keeper", new Set(["store keeper (copy)"]))).toBe(
      "Store Keeper (copy 2)",
    );
    expect(copyName("x".repeat(100), new Set())).toHaveLength(100);
  });
});

describe("changedCells", () => {
  it("is every cell added or removed", () => {
    const after = PermissionSet.fromGrants({
      "labour.attendance": ["read", "delete"],
      "tracking.tasks": ["read"],
    });
    expect(changedCells(attendance, after).toGrants()).toEqual({
      "labour.attendance": ["create", "delete"],
      "tracking.tasks": ["read"],
    });
    expect(changedCells(attendance, attendance).size).toBe(0);
  });
});
