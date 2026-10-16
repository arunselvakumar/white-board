import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getCentralPayment } from "@/app/api/construction/finance/central-payment/route";
import type { GetConstructionFinanceCentralPaymentResponseModel as CentralPayment } from "@/app/api/construction/finance/central-payment/central-payment-models";
import { GET as getFinanceDashboard } from "@/app/api/construction/finance/dashboard/route";
import type { GetConstructionFinanceDashboardResponseModel as FinanceDashboard } from "@/app/api/construction/finance/dashboard/dashboard-models";
import { GET as listOtherExpenses } from "@/app/api/construction/finance/other-expenses/route";
import { GET as listVouchers } from "@/app/api/construction/finance/petty-cash/vouchers/route";
import { GET as listSettlements } from "@/app/api/construction/finance/settlements/route";
import { GET as listTransactions } from "@/app/api/construction/finance/transactions/route";
import { GET as getLabourSummary } from "@/app/api/construction/labour/summary/route";
import { GET as getProcurementDashboard } from "@/app/api/construction/procurement/dashboard/route";
import type { GetConstructionProcurementDashboardResponseModel as ProcurementDashboard } from "@/app/api/construction/procurement/dashboard/dashboard-models";
import { GET as listPurchaseOrders } from "@/app/api/construction/procurement/purchase-orders/route";
import { GET as listPurchaseRequests } from "@/app/api/construction/procurement/purchase-requests/route";
import { GET as listTransfers } from "@/app/api/construction/procurement/transfers/route";
import { GET as listEquipmentSheets } from "@/app/api/construction/site-work/equipment-sheets/route";
import { GET as listWorksheets } from "@/app/api/construction/site-work/worksheets/route";
import { GET as getTrackingDashboard } from "@/app/api/construction/tracking/dashboard/route";
import type { GetConstructionTrackingDashboardResponseModel as TrackingDashboard } from "@/app/api/construction/tracking/dashboard/dashboard-models";
import { GET as listInspections } from "@/app/api/construction/tracking/inspections/route";
import { GET as listIssues } from "@/app/api/construction/tracking/issues/route";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import {
  dashboardLabourAttendance,
  dashboardMaterialTransfer,
  dashboardPurchaseRequest,
  dashboardSheetStatus,
} from "@/test/dashboard-documents";
import { addAccount, seededAccounts } from "@/test/finance";
import {
  reportInvoice,
  reportOtherExpense,
  reportPartyPayment,
  reportSettlement,
  reportTransaction,
  reportTransfer,
  reportVoucher,
} from "@/test/finance-reports";
import { addPurchaseOrder } from "@/test/procurement-orders";
import { addContractor, addSupplier } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";
import {
  sharedAddEquipmentUsageRow,
  sharedAddWorksheetRow,
} from "@/test/site-work";
import { trackingInspectionRow, trackingIssueRow } from "@/test/tracking";

import type { GetConstructionReportingCompanyDashboardResponseModel as CompanyDashboard } from "./company-dashboard-models";
import { GET as getCompanyDashboard } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

type Actor = { userId: string; workspaceId: string; role: "owner" | "member" };

const TODAY = todayIn("Asia/Kolkata");
const DURATION = { from: addDays(TODAY, -60), to: TODAY };

async function read<T>(
  actor: Actor,
  route: (request: Request) => Promise<Response>,
  path: string,
  query: Record<string, string>,
): Promise<T> {
  actAs(actor);
  const response = await route(
    new Request(
      `${TEST_ORIGIN}/api/construction/${path}?${new URLSearchParams(query).toString()}`,
    ),
  );
  expect(response.status, path).toBe(StatusCodes.OK);
  return (await response.json()) as T;
}

type Total = { total: number };

/**
 * One Project with something waiting in every module, decided and
 * tombstoned rows beside them, and a second Project for noise.
 */
async function world() {
  const { workspaceId: ws, ownerId: by } = await newCompany();
  const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
  const tower = await addProject(ws, by, "Tower A");
  const villa = await addProject(ws, by, "Villa B");
  const { cashId, bankId } = await seededAccounts(ws);
  const holder = await addMember(ws, by, {});
  const pettyCash = await addAccount(ws, by, {
    kind: "petty_cash",
    holderMemberId: holder.memberId,
  });
  const supplierId = await addSupplier(ws, by, [tower]);
  const contractor = await addContractor(ws, by, [tower]);

  for (const projectId of [tower, villa]) {
    // Materials: 2 PRs, 1 PO, 1 transfer out pending on each Project.
    await dashboardPurchaseRequest(ws, by, projectId);
    await dashboardPurchaseRequest(ws, by, projectId);
    await addPurchaseOrder(ws, by, {
      location: { kind: "project", id: projectId },
      supplierId,
      lines: [],
      approvalStatus: "pending",
    });
    await dashboardMaterialTransfer(ws, by, {
      fromProjectId: projectId,
      toProjectId: projectId === tower ? villa : tower,
    });
    // Site work: a pending worksheet and equipment usage sheet.
    const sheet = await sharedAddWorksheetRow(ws, by, projectId);
    await dashboardSheetStatus("worksheet", sheet.id, "pending");
    const usage = await sharedAddEquipmentUsageRow(ws, by, projectId);
    await dashboardSheetStatus("equipment_usage", usage.id, "pending");
    // Payments.
    const pending = { status: "pending" as const };
    await reportTransaction(ws, by, {
      accountId: cashId,
      projectId,
      date: TODAY,
      amount: 100n,
      ...pending,
    });
    await reportTransfer(ws, by, {
      fromAccountId: bankId,
      toAccountId: cashId,
      projectId,
      date: TODAY,
      amount: 100n,
      ...pending,
    });
    await reportVoucher(ws, by, {
      accountId: pettyCash,
      projectId,
      date: TODAY,
      amount: 100n,
      ...pending,
    });
    await reportOtherExpense(ws, by, {
      accountId: cashId,
      projectId,
      date: TODAY,
      amount: 100n,
      ...pending,
    });
  }

  // Decided and tombstoned documents on Tower do not count.
  await dashboardPurchaseRequest(ws, by, tower, { approvalStatus: "approved" });
  await dashboardPurchaseRequest(ws, by, tower, { deleted: true });
  await dashboardMaterialTransfer(ws, by, {
    fromProjectId: tower,
    toProjectId: villa,
    deleted: true,
  });
  // A transfer into Tower is decided by Villa.
  const decided = await sharedAddWorksheetRow(ws, by, tower);
  await dashboardSheetStatus("worksheet", decided.id, "approved");
  await sharedAddWorksheetRow(ws, by, tower); // approval not required
  await reportTransaction(ws, by, {
    accountId: cashId,
    projectId: tower,
    date: TODAY,
    amount: 100n,
    status: "rejected",
  });

  // Tower's bills from the Contractor: one part-paid and overdue, one
  // settled by a pending settlement (still due), one paid in full.
  const overdue = await reportInvoice(ws, by, {
    partyType: "contractor",
    partyId: contractor,
    projectId: tower,
    date: addDays(TODAY, -40),
    dueDate: addDays(TODAY, -10),
    amount: 10_000_00n,
  });
  await reportPartyPayment(ws, by, {
    partyType: "contractor",
    partyId: contractor,
    projectId: tower,
    accountId: cashId,
    date: addDays(TODAY, -5),
    amount: 4_000_00n,
    allocations: [{ invoiceId: overdue, amount: 4_000_00n }],
  });
  const settling = await reportInvoice(ws, by, {
    partyType: "contractor",
    partyId: contractor,
    projectId: tower,
    date: addDays(TODAY, -3),
    amount: 2_500_00n,
  });
  await reportSettlement(ws, by, { invoiceId: settling, amount: 2_500_00n });
  const paid = await reportInvoice(ws, by, {
    partyType: "contractor",
    partyId: contractor,
    projectId: tower,
    date: addDays(TODAY, -3),
    amount: 1_000_00n,
  });
  await reportPartyPayment(ws, by, {
    partyType: "contractor",
    partyId: contractor,
    projectId: tower,
    accountId: cashId,
    date: TODAY,
    amount: 1_000_00n,
    allocations: [{ invoiceId: paid, amount: 1_000_00n }],
  });

  // Tracking on Tower: 2 open (1 delayed), 1 solved, 1 tombstoned; 1
  // pending inspection, 1 tombstoned, 1 outside the duration.
  await trackingIssueRow(ws, tower, by);
  await trackingIssueRow(ws, tower, by, {
    issueDate: addDays(TODAY, -20),
    dueDate: addDays(TODAY, -2),
  });
  await trackingIssueRow(ws, tower, by, { status: "solved" });
  await trackingIssueRow(ws, tower, by, { deleted: true });
  await trackingIssueRow(ws, tower, by, { issueDate: addDays(TODAY, -90) });
  await trackingInspectionRow(ws, tower, by);
  await trackingInspectionRow(ws, tower, by, { deleted: true });

  // Labour on Tower today: present, half day, absent.
  for (const status of ["present", "half_day", "absent"] as const)
    await dashboardLabourAttendance(ws, by, {
      projectId: tower,
      date: TODAY,
      status,
    });

  return { ws, by, owner, tower, villa, contractor };
}

describe("dashboard views agree with the module lists (CM-902)", () => {
  it("each KPI tile, Due Payments and the Company Dashboard equal the lists and reports on the same data", async () => {
    const s = await world();
    const projectId = s.tower;
    const owner = s.owner;
    const dashboardQuery = { projectId, ...DURATION };

    // Material Approvals = the PR, PO and Material Transfer lists' Pending.
    const procurement = await read<ProcurementDashboard>(
      owner,
      getProcurementDashboard,
      "procurement/dashboard",
      dashboardQuery,
    );
    const prs = await read<Total>(
      owner,
      listPurchaseRequests,
      "procurement/purchase-requests",
      { projectId, approvalStatus: "pending" },
    );
    const pos = await read<Total>(
      owner,
      listPurchaseOrders,
      "procurement/purchase-orders",
      { projectId, approvalStatus: "pending" },
    );
    const transfersOut = await read<Total>(
      owner,
      listTransfers,
      "procurement/transfers",
      {
        locationKind: "project",
        locationId: projectId,
        direction: "out",
        status: "pending",
      },
    );
    expect(procurement.approvals).toEqual({
      purchaseRequests: prs.total,
      purchaseOrders: pos.total,
      transfers: transfersOut.total,
      total: prs.total + pos.total + transfersOut.total,
    });
    expect(procurement.approvals.total).toBe(4);

    // Payment Approvals = the Transactions (with transfers), petty-cash
    // vouchers, Other Expenses and settlements lists' Pending.
    const finance = await read<FinanceDashboard>(
      owner,
      getFinanceDashboard,
      "finance/dashboard",
      dashboardQuery,
    );
    const transactions = await read<Total>(
      owner,
      listTransactions,
      "finance/transactions",
      { projectId, approvalStatus: "pending" },
    );
    const vouchers = await read<Total>(
      owner,
      listVouchers,
      "finance/petty-cash/vouchers",
      { projectId, status: "pending" },
    );
    const expenses = await read<Total>(
      owner,
      listOtherExpenses,
      "finance/other-expenses",
      { projectId, status: "pending" },
    );
    const settlements = await read<{ items: unknown[] }>(
      owner,
      listSettlements,
      "finance/settlements",
      { projectId, status: "pending" },
    );
    expect(
      (finance.approvals.transactions ?? 0) +
        (finance.approvals.transfers ?? 0),
    ).toBe(transactions.total);
    expect(finance.approvals).toMatchObject({
      vouchers: vouchers.total,
      otherExpenses: expenses.total,
      settlements: settlements.items.length,
      total:
        transactions.total +
        vouchers.total +
        expenses.total +
        settlements.items.length,
    });
    expect(finance.approvals.total).toBe(5);

    // Pending Issues & Snags and Pending Inspections = the lists' chips.
    const tracking = await read<TrackingDashboard>(
      owner,
      getTrackingDashboard,
      "tracking/dashboard",
      dashboardQuery,
    );
    const issues = await read<Total>(owner, listIssues, "tracking/issues", {
      projectId,
      status: "pending,delayed",
      ...DURATION,
    });
    const inspections = await read<Total>(
      owner,
      listInspections,
      "tracking/inspections",
      { projectId, status: "pending", ...DURATION },
    );
    expect(tracking.kpis).toEqual({
      pendingIssues: issues.total,
      pendingInspections: inspections.total,
    });
    expect(tracking.kpis).toEqual({ pendingIssues: 2, pendingInspections: 1 });

    // Due Payments = Central Payment's dues (only Tower has bills).
    const central = await read<CentralPayment>(
      owner,
      getCentralPayment,
      "finance/central-payment",
      {},
    );
    const fromCentral = central.parties.contractor.find(
      (party) => party.partyId === s.contractor,
    );
    const dues = finance.payments?.dues ?? [];
    expect(dues).toEqual([
      {
        partyType: "contractor",
        partyId: s.contractor,
        name: fromCentral?.name,
        invoiced: fromCentral?.invoiced,
        paid: fromCentral?.paid,
        due: fromCentral?.due,
        overdue: fromCentral?.overdue,
      },
    ]);
    expect(dues[0]).toMatchObject({
      invoiced: 13_500_00,
      paid: 5_000_00,
      due: 8_500_00,
      overdue: 6_000_00,
    });

    // The Company Dashboard's row for Tower says the same.
    const company = await read<CompanyDashboard>(
      owner,
      getCompanyDashboard,
      "reporting/company-dashboard",
      DURATION,
    );
    const worksheets = await read<Total>(
      owner,
      listWorksheets,
      "site-work/worksheets",
      { projectId, approvalStatus: "pending" },
    );
    const usageSheets = await read<Total>(
      owner,
      listEquipmentSheets,
      "site-work/equipment-sheets",
      { projectId, approvalStatus: "pending" },
    );
    const labour = await read<{
      labourers: { present: number; halfDay: number };
    }>(owner, getLabourSummary, "labour/summary", { projectId });
    const row = company.projects.find((item) => item.id === projectId);
    expect(row).toMatchObject({
      name: "Tower A",
      approvals:
        procurement.approvals.total +
        finance.approvals.total +
        worksheets.total +
        usageSheets.total,
      pendingIssues: tracking.kpis.pendingIssues,
      delayedIssues: 1,
      pendingInspections: tracking.kpis.pendingInspections,
      labourToday: labour.labourers.present + labour.labourers.halfDay,
      due: fromCentral?.due,
    });
    expect(row?.approvals).toBe(11);
    expect(row?.labourToday).toBe(2);
    expect(company.totals).toMatchObject({
      activeProjects: 2,
      approvals: 21,
      pendingIssues: 2,
      pendingInspections: 1,
      labourToday: 2,
      amountDue: 8_500_00,
    });
  });

  it("the views leave out tombstoned rows and other Companies", async () => {
    const s = await world();
    const other = await world();
    const rows = await prisma.$queryRaw<{ module: string; pending: number }[]>`
      SELECT module, pending FROM construction_reporting.project_pending_approvals
      WHERE workspace_id = ${s.ws} AND project_id = ${s.tower}::uuid
      ORDER BY module`;
    expect(Object.fromEntries(rows.map((r) => [r.module, r.pending]))).toEqual({
      account_transfers: 1,
      equipment_usage_sheets: 1,
      invoice_settlements: 1,
      material_transfers: 1,
      other_expenses: 1,
      petty_cash_vouchers: 1,
      purchase_orders: 1,
      purchase_requests: 2,
      transactions: 1,
      worksheets: 1,
    });
    const tracking = await prisma.$queryRaw<
      { pending: number; delayed: number; inspections: number }[]
    >`
      SELECT pending_issues AS pending, delayed_issues AS delayed,
             pending_inspections AS inspections
      FROM construction_reporting.project_pending_tracking(${s.ws}, ${TODAY}::date)
      WHERE project_id = ${s.tower}::uuid`;
    // No duration: the issue from 90 days ago counts too.
    expect(tracking).toEqual([{ pending: 2, delayed: 1, inspections: 1 }]);
    const dues = await prisma.$queryRaw<{ workspaceId: string; due: bigint }[]>`
      SELECT workspace_id AS "workspaceId", sum(due)::bigint AS due
      FROM construction_reporting.party_dues
      WHERE workspace_id IN (${s.ws}, ${other.ws}) AND direction = 'payable'
      GROUP BY 1`;
    expect(dues).toHaveLength(2);
    expect(dues.every((row) => row.due === 8_500_00n)).toBe(true);
    const comments = await prisma.$queryRaw<
      { name: string; comment: string }[]
    >`
      SELECT c.relname AS name, obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'construction_reporting' AND c.relkind = 'v'
      UNION ALL
      SELECT p.proname, obj_description(p.oid, 'pg_proc')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'construction_reporting'
      ORDER BY 1`;
    expect(comments.map((item) => item.name)).toEqual([
      "party_dues",
      "party_dues_on",
      "project_pending_approvals",
      "project_pending_tracking",
    ]);
    for (const item of comments) expect(item.comment).toMatch(/Readers?:/);
  });
});
