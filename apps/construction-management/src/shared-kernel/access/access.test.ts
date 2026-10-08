import { describe, expect, it } from "vitest";

import {
  FLAGS,
  MENUS,
  PermissionSet,
  can,
  financialValue,
  fromMask,
  hrmsDefaultPermissions,
  ownEntriesOnly,
  toMask,
  type MemberAccess,
} from "./index";

function member(
  permissions: PermissionSet,
  projectIds: string[] = [],
): MemberAccess {
  return {
    workspaceId: "company-1",
    userId: "user-2",
    role: "member",
    permissions,
    projectIds: new Set(projectIds),
  };
}

describe("flag bitmask", () => {
  it("round-trips every flag", () => {
    expect(fromMask(toMask(FLAGS))).toEqual([...FLAGS]);
    expect(toMask(["create", "read"])).toBe(0b11);
    expect(fromMask(0)).toEqual([]);
  });
});

describe("the menu catalogue", () => {
  it("has the specified cell counts per category (export/import excluded)", () => {
    const visible = [
      "create",
      "read",
      "update",
      "delete",
      "approve",
      "reject",
      "print",
      "report",
      "view_all",
      "notification",
      "transfer",
      "financial",
    ] as const;
    const counts: Record<string, number> = {};
    for (const menu of MENUS) {
      counts[menu.category] =
        (counts[menu.category] ?? 0) +
        fromMask(menu.supported).filter((flag) =>
          (visible as readonly string[]).includes(flag),
        ).length;
    }
    expect(counts).toEqual({
      project_management: 114,
      payment_accounting: 30,
      materials: 46,
      master_records: 92,
      central_store: 20,
      hrms: 57,
      others: 1,
    });
  });

  it("has unique keys", () => {
    expect(new Set(MENUS.map((menu) => menu.key)).size).toBe(MENUS.length);
  });
});

describe("PermissionSet", () => {
  it("drops cells a menu does not support", () => {
    const set = PermissionSet.fromGrants({
      "projects.gallery": ["read", "delete"],
      "nope.menu": ["read"],
    });
    expect(set.toGrants()).toEqual({ "projects.gallery": ["read"] });
  });
});

describe("can()", () => {
  it("lets the Owner do anything", () => {
    expect(
      can(
        { ...member(PermissionSet.empty()), role: "owner" },
        "finance.petty_cash",
        "approve",
      ),
    ).toBe(true);
  });

  it("follows the Member's matrix", () => {
    const access = member(
      PermissionSet.fromGrants({
        "procurement.purchase_requests": ["create", "read"],
      }),
    );
    expect(can(access, "procurement.purchase_requests", "create")).toBe(true);
    expect(can(access, "procurement.purchase_requests", "approve")).toBe(false);
    expect(can(access, "procurement.purchase_orders", "read")).toBe(false);
  });

  it("needs the Project assignment for a project-level menu", () => {
    const access = member(
      PermissionSet.fromGrants({ "site_work.daily_worksheet": ["create"] }),
      ["project-a"],
    );
    expect(
      can(access, "site_work.daily_worksheet", "create", {
        projectId: "project-a",
      }),
    ).toBe(true);
    expect(
      can(access, "site_work.daily_worksheet", "create", {
        projectId: "project-b",
      }),
    ).toBe(false);
    // Company-level menus ignore the project.
    const hr = member(hrmsDefaultPermissions());
    expect(can(hr, "hrms.leaves", "create", { projectId: "project-b" })).toBe(
      true,
    );
  });
});

describe("View All and Financial", () => {
  it("filters lists to own entries without View All", () => {
    const without = member(
      PermissionSet.fromGrants({ "tracking.tasks": ["read"] }),
    );
    const withAll = member(
      PermissionSet.fromGrants({ "tracking.tasks": ["read", "view_all"] }),
    );
    expect(ownEntriesOnly(without, "tracking.tasks")).toEqual({
      createdBy: "user-2",
    });
    expect(ownEntriesOnly(withAll, "tracking.tasks")).toBeNull();
  });

  it("nulls amounts without Financial", () => {
    const without = member(
      PermissionSet.fromGrants({ "tracking.tasks": ["read"] }),
    );
    const withFinancial = member(
      PermissionSet.fromGrants({ "tracking.tasks": ["read", "financial"] }),
    );
    expect(financialValue(without, "tracking.tasks", 125000)).toBeNull();
    expect(financialValue(withFinancial, "tracking.tasks", 125000)).toBe(
      125000,
    );
  });
});

describe("HRMS default set", () => {
  it("matches ADR CM-0002", () => {
    expect(hrmsDefaultPermissions().toGrants()).toEqual({
      "hrms.hrms": ["read"],
      "hrms.holidays": ["read"],
      "hrms.attendance": ["create", "read", "notification"],
      "hrms.leaves": ["create", "read", "notification"],
      "hrms.salaries": ["read"],
    });
  });
});
