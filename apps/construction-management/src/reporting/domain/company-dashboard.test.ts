import { describe, expect, it } from "vitest";

import { presetDuration } from "@/lib/dashboard-duration";

import {
  companyDashboardTotals,
  compareDashboardProjects,
  lastTwelveMonths,
  type CompanyDashboardRow,
} from "./company-dashboard";
import {
  APPROVAL_MODULES,
  approvalsWaiting,
  materialApprovals,
  noApprovals,
  paymentApprovals,
  type ApprovalCounts,
  type ApprovalModule,
} from "./dashboard-approvals";

function row(overrides: Partial<CompanyDashboardRow>): CompanyDashboardRow {
  return {
    id: "p1",
    name: "Kumari Heights",
    status: "ongoing",
    progress: null,
    approvals: null,
    pendingIssues: null,
    delayedIssues: null,
    pendingInspections: null,
    labourToday: null,
    due: null,
    ...overrides,
  };
}

function counts(values: Partial<ApprovalCounts>): ApprovalCounts {
  return { ...noApprovals(), ...values };
}

const everything = () => true;
const only =
  (...modules: ApprovalModule[]) =>
  (module: ApprovalModule) =>
    modules.includes(module);

describe("approval tiles (CM-902)", () => {
  const pending = counts({
    purchase_requests: 3,
    purchase_orders: 1,
    material_transfers: 2,
    worksheets: 4,
    equipment_usage_sheets: 5,
    transactions: 2,
    account_transfers: 1,
    petty_cash_vouchers: 3,
    other_expenses: 1,
    invoice_settlements: 1,
  });

  it("Material Approvals: PRs, POs and transfers, null without Approve", () => {
    expect(materialApprovals(pending, everything)).toEqual({
      purchaseRequests: 3,
      purchaseOrders: 1,
      transfers: 2,
      total: 6,
    });
    expect(materialApprovals(pending, only("purchase_orders"))).toEqual({
      purchaseRequests: null,
      purchaseOrders: 1,
      transfers: null,
      total: 1,
    });
  });

  it("Payment Approvals: transfers follow Transactions' Approve", () => {
    expect(paymentApprovals(pending, everything)).toEqual({
      transactions: 2,
      transfers: 1,
      vouchers: 3,
      otherExpenses: 1,
      settlements: 1,
      total: 8,
    });
    expect(
      paymentApprovals(pending, only("transactions", "account_transfers")),
    ).toMatchObject({ vouchers: null, settlements: null, total: 3 });
  });

  it("approvals waiting counts every module the member decides, worksheets included", () => {
    expect(approvalsWaiting(pending, everything)).toBe(23);
    expect(
      approvalsWaiting(pending, only("worksheets", "equipment_usage_sheets")),
    ).toBe(9);
    expect(approvalsWaiting(noApprovals(), only("worksheets"))).toBe(0);
    expect(approvalsWaiting(pending, () => false)).toBeNull();
    expect(APPROVAL_MODULES).toHaveLength(10);
  });
});

describe("Company Dashboard totals (CM-902)", () => {
  it("sums what the member sees and is null where they see nothing", () => {
    const totals = companyDashboardTotals([
      row({ id: "a", approvals: 2, pendingIssues: 3, due: 1_000_00n }),
      row({
        id: "b",
        status: "on_hold",
        approvals: null,
        pendingIssues: 1,
        labourToday: 12,
        due: 250_00n,
      }),
      row({ id: "c", status: "completed" }),
    ]);
    expect(totals).toEqual({
      activeProjects: 1,
      approvals: 2,
      pendingIssues: 4,
      pendingInspections: null,
      labourToday: 12,
      amountDue: 1_250_00n,
    });
    expect(companyDashboardTotals([])).toEqual({
      activeProjects: 0,
      approvals: null,
      pendingIssues: null,
      pendingInspections: null,
      labourToday: null,
      amountDue: null,
    });
  });

  it("orders Projects as the Projects home: status, then name", () => {
    const sorted = [
      row({ name: "Villa B", status: "completed" }),
      row({ name: "tower 10", status: "ongoing" }),
      row({ name: "Gamma", status: "not_started" }),
      row({ name: "Tower 9", status: "ongoing" }),
    ].sort(compareDashboardProjects);
    expect(sorted.map((item) => item.name)).toEqual([
      "Tower 9",
      "tower 10",
      "Gamma",
      "Villa B",
    ]);
  });

  it("defaults to the duration filter's last 12 months", () => {
    for (const today of ["2026-10-16", "2024-02-29", "2026-03-31"]) {
      const { from, to } = presetDuration("last_12_months", today);
      expect(lastTwelveMonths(today)).toEqual({ from, to });
    }
  });
});
