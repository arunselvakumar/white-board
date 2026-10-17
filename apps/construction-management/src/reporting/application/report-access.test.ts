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
    expect(kinds(project)).not.toContain("purchase_orders");
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
      "equipment_maintenance",
      "equipment_transfers",
      "account_ledger",
      "tds_194c",
      "due_payments",
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
});
