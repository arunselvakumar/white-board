import { describe, expect, it } from "vitest";

import {
  PermissionSet,
  type MemberAccess,
  type PermissionGrants,
} from "@/src/shared-kernel/access";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  backupModule,
  BACKUP_ENTITY_KEYS,
  BACKUP_MODULES,
  COMPANY_BACKUP_MODULES,
} from "../domain/backup-modules";
import {
  canBackUpModule,
  allowHrmsBackup,
  allowMastersBackup,
  allowProjectBackup,
  backupOptions,
} from "./backup-access";

const PROJECT = "11111111-1111-4111-8111-111111111111";

function member(grants: PermissionGrants, projects = [PROJECT]): MemberAccess {
  return {
    workspaceId: "ws",
    userId: "u",
    role: "member",
    permissions: PermissionSet.fromGrants(grants),
    projectIds: new Set(projects),
  };
}

function refusal(run: () => unknown): DomainError | null {
  try {
    run();
    return null;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
}

describe("backup access (CM-906)", () => {
  it("keeps module keys and entity keys unique", () => {
    expect(new Set(COMPANY_BACKUP_MODULES).size).toBe(BACKUP_MODULES.length);
    expect(new Set(BACKUP_ENTITY_KEYS).size).toBe(BACKUP_ENTITY_KEYS.length);
  });

  it("needs Project View, then View on each module, naming the first refused", () => {
    const viewer = member({
      "projects.project": ["read"],
      "site_work.daily_worksheet": ["read"],
    });
    expect(
      allowProjectBackup(viewer, PROJECT, ["site_work.daily_worksheet"]).map(
        (allowed) => allowed.module.key,
      ),
    ).toEqual(["site_work.daily_worksheet"]);
    const denied = refusal(() =>
      allowProjectBackup(viewer, PROJECT, [
        "site_work.daily_worksheet",
        "tracking.tasks",
      ]),
    );
    expect(denied).toMatchObject({
      code: "PERMISSION_DENIED",
      kind: "forbidden",
      details: { module: "tracking.tasks" },
    });
    expect(
      refusal(() =>
        allowProjectBackup(
          member({ "site_work.daily_worksheet": ["read"] }),
          PROJECT,
          ["site_work.daily_worksheet"],
        ),
      )?.kind,
    ).toBe("forbidden");
    expect(
      refusal(() =>
        allowProjectBackup(viewer, PROJECT, ["masters.contractors"]),
      )?.code,
    ).toBe("BACKUP_MODULE_UNKNOWN");
    expect(refusal(() => allowProjectBackup(viewer, PROJECT, []))?.code).toBe(
      "BACKUP_MODULES_REQUIRED",
    );
  });

  it("gives each module its money right: Financial, or View on finance menus", () => {
    const access = member({
      "projects.project": ["read"],
      "site_work.equipment_usage": ["read"],
      "procurement.material_received": ["read", "financial"],
      "finance.transactions": ["read"],
      "labour.attendance": ["read"],
    });
    const money = Object.fromEntries(
      allowProjectBackup(access, PROJECT, [
        "site_work.equipment_usage",
        "procurement.material_received",
        "finance.transactions",
        "labour.attendance",
      ]).map((allowed) => [allowed.module.key, allowed.money]),
    );
    expect(money).toEqual({
      "site_work.equipment_usage": false,
      "procurement.material_received": true,
      "finance.transactions": true,
      // Wages follow Labour's Financial.
      "labour.attendance": false,
    });
  });

  it("checks masters without a Project and offers only what may be backed up", () => {
    const access = member({ "masters.materials": ["read"] });
    expect(allowMastersBackup(access, ["masters.materials"])[0]?.money).toBe(
      false,
    );
    expect(
      refusal(() => allowMastersBackup(access, ["masters.suppliers"]))?.details,
    ).toEqual({ module: "masters.suppliers" });
    expect(
      backupOptions(access, "masters", null).map((option) => option.module.key),
    ).toEqual(["masters.materials"]);
    expect(backupOptions(member({}, []), "project", PROJECT)).toEqual([]);
  });

  it("gates HRMS modules on their menus' View and salary amounts on Salary Management's Financial", () => {
    const viewer = member({
      "hrms.holidays": ["read"],
      "hrms.salaries": ["read"],
    });
    expect(
      allowHrmsBackup(viewer, ["hrms.holidays", "hrms.salaries"]).map(
        (allowed) => [allowed.module.key, allowed.money],
      ),
    ).toEqual([
      ["hrms.holidays", false],
      ["hrms.salaries", false],
    ]);
    const financial = member({ "hrms.salaries": ["read", "financial"] });
    expect(allowHrmsBackup(financial, ["hrms.salaries"])[0]?.money).toBe(true);
    expect(
      refusal(() => allowHrmsBackup(viewer, ["hrms.leaves"]))?.details,
    ).toEqual({ module: "hrms.leaves" });
    expect(refusal(() => allowHrmsBackup(viewer, ["masters.tags"]))?.code).toBe(
      "BACKUP_MODULE_UNKNOWN",
    );
  });
});

describe("Inquiries backup needs View all (review of #93)", () => {
  const inquiries = backupModule("sales.inquiries");

  it("is refused to a member who only sees their own inquiries", () => {
    if (inquiries == null) throw new Error("no Inquiries module");
    expect(
      canBackUpModule(
        member({ "sales.inquiries": ["read"] }),
        inquiries,
        PROJECT,
      ),
    ).toBe(false);
    expect(
      canBackUpModule(
        member({ "sales.inquiries": ["read", "view_all"] }),
        inquiries,
        PROJECT,
      ),
    ).toBe(true);
  });

  it("says it needs View all when it refuses", () => {
    const refused = refusal(() =>
      allowProjectBackup(
        member({
          "projects.project": ["read"],
          "sales.inquiries": ["read"],
        }),
        PROJECT,
        ["sales.inquiries"],
      ),
    );
    expect(refused?.code).toBe("PERMISSION_DENIED");
    expect(refused?.message).toBe(
      "You cannot back up Inquiries: it needs View and View all on Inquiries. Ask the Owner to change your Permission Matrix.",
    );
    expect(refused?.details).toEqual({ module: "sales.inquiries" });
    const bookings = refusal(() =>
      allowProjectBackup(member({ "projects.project": ["read"] }), PROJECT, [
        "sales.bookings",
      ]),
    );
    expect(bookings?.message).toContain("it needs View on Bookings.");
  });

  it("still needs only View for Bookings", () => {
    const bookings = backupModule("sales.bookings");
    if (bookings == null) throw new Error("no Bookings module");
    expect(
      canBackUpModule(
        member({ "sales.bookings": ["read"] }),
        bookings,
        PROJECT,
      ),
    ).toBe(true);
  });
});
