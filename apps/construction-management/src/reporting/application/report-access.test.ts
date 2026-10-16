import { describe, expect, it } from "vitest";

import {
  PermissionSet,
  type MemberAccess,
  type PermissionGrants,
} from "@/src/shared-kernel/access";

import { viewerCatalogue } from "./report-access";

const PROJECT = "0190a000-0000-7000-8000-000000000001";
const ELSEWHERE = "0190a000-0000-7000-8000-000000000002";

function member(
  grants: PermissionGrants,
  role: MemberAccess["role"] = "member",
): MemberAccess {
  return {
    workspaceId: "ws-1",
    userId: "user-1",
    role,
    permissions: PermissionSet.fromGrants(grants),
    projectIds: new Set([PROJECT]),
  };
}

const kinds = (entries: { kind: string }[]) =>
  entries.map((entry) => entry.kind);

describe("the catalogue a viewer may request", () => {
  it("gives the Owner every built report of the scope, with money", () => {
    const owner = member({}, "owner");
    const project = viewerCatalogue(owner, "project", PROJECT);
    expect(kinds(project)).toContain("muster_roll");
    expect(kinds(project)).toContain("daily_progress_report");
    expect(kinds(project)).toContain("purchase_orders");
    expect(kinds(project)).not.toContain("labour_attendance_central");
    expect(kinds(project)).not.toContain("tds_194c");
    expect(
      project.find((entry) => entry.kind === "labour_month")?.includesMoney,
    ).toBe(true);
    expect(
      project.find((entry) => entry.kind === "labour_attendance")
        ?.includesMoney,
    ).toBe(false);
    const central = viewerCatalogue(owner, "central", null);
    expect(kinds(central)).toEqual([
      "vendor_attendance",
      "labour_attendance_central",
      "equipment_maintenance",
      "equipment_transfers",
      "account_ledger",
      "tds_194c",
      "due_payments",
      "purchase_requests",
      "purchase_orders",
      "material_received",
      "material_transfers",
      "stock_register",
    ]);
  });

  it("leaves out reports about money without Financial", () => {
    const reporter = member({ "labour.labour": ["read", "report"] });
    const entries = viewerCatalogue(reporter, "project", PROJECT);
    expect(kinds(entries)).toEqual(["labour_attendance", "labour_month"]);
    expect(entries.every((entry) => !entry.includesMoney)).toBe(true);

    const financial = member({
      "labour.labour": ["read", "report", "financial"],
    });
    const withMoney = viewerCatalogue(financial, "project", PROJECT);
    expect(kinds(withMoney)).toEqual([
      "labour_attendance",
      "labour_payment",
      "labour_month",
      "muster_roll",
    ]);
    expect(
      withMoney.find((entry) => entry.kind === "muster_roll")?.includesMoney,
    ).toBe(true);
  });

  it("needs the member on the Project for a project-level menu", () => {
    const reporter = member({ "labour.labour": ["read", "report"] });
    expect(viewerCatalogue(reporter, "project", ELSEWHERE)).toEqual([]);
  });

  it("offers the Ledger with Petty Cash Report, and finance money with Report", () => {
    const petty = member({ "finance.petty_cash": ["read", "report"] });
    const central = viewerCatalogue(petty, "central", null);
    expect(kinds(central)).toEqual(["account_ledger"]);
    expect(central[0]?.includesMoney).toBe(true);
    expect(central[0]?.filters[0]).toEqual({ key: "account", required: true });
    expect(kinds(viewerCatalogue(petty, "project", PROJECT))).toEqual([
      "petty_cash",
    ]);
  });

  it("offers a Progress Report with Progress Report Add, hire cost with Equipment Usage Financial", () => {
    const writer = member({
      "site_work.progress_reports": ["create", "read"],
    });
    const entries = viewerCatalogue(writer, "project", PROJECT);
    expect(kinds(entries)).toEqual([
      "daily_progress_report",
      "task_progress_report",
    ]);
    expect(entries.every((entry) => entry.progressReport)).toBe(true);
    expect(entries[0]?.includesMoney).toBe(false);
    const withCost = member({
      "site_work.progress_reports": ["create", "read"],
      "site_work.equipment_usage": ["read", "financial"],
    });
    expect(
      viewerCatalogue(withCost, "project", PROJECT)[0]?.includesMoney,
    ).toBe(true);
  });

  it("needs Central Reports Read for a central report no module hosts (CM-903)", () => {
    const grants = {
      "procurement.purchase_orders": ["read", "report"],
      "labour.labour": ["read", "report"],
      "masters.equipments": ["read", "report"],
    } as const;
    const without = member(grants);
    expect(kinds(viewerCatalogue(without, "central", null))).toEqual([
      "equipment_maintenance",
      "equipment_transfers",
    ]);
    // The Project's own reports never need it.
    expect(kinds(viewerCatalogue(without, "project", PROJECT))).toContain(
      "purchase_orders",
    );
    const withCentral = member({
      ...grants,
      "reporting.central_reports": ["read"],
    });
    const central = viewerCatalogue(withCentral, "central", null);
    expect(kinds(central)).toEqual([
      "labour_attendance_central",
      "equipment_maintenance",
      "equipment_transfers",
      "purchase_orders",
    ]);
    // Purchase Order has no Financial: Report shows its amounts.
    expect(
      central.find((entry) => entry.kind === "purchase_orders")?.includesMoney,
    ).toBe(true);
  });

  it("puts Material Received amounts behind its Financial", () => {
    const reporter = member({
      "procurement.material_received": ["read", "report"],
    });
    const entry = viewerCatalogue(reporter, "project", PROJECT).find(
      (item) => item.kind === "material_received",
    );
    expect(entry?.includesMoney).toBe(false);
    const financial = member({
      "procurement.material_received": ["read", "report", "financial"],
    });
    expect(
      viewerCatalogue(financial, "project", PROJECT).find(
        (item) => item.kind === "material_received",
      )?.includesMoney,
    ).toBe(true);
  });
});
