import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { presetDuration } from "@/lib/dashboard-duration";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import {
  dashboardLabourAttendance,
  dashboardPurchaseRequest,
  dashboardSheetStatus,
} from "@/test/dashboard-documents";
import { seededAccounts } from "@/test/finance";
import { reportInvoice, reportTransaction } from "@/test/finance-reports";
import { addContractor } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";
import { sharedAddWorksheetRow } from "@/test/site-work";
import { trackingInspectionRow, trackingIssueRow } from "@/test/tracking";

import type { GetConstructionReportingCompanyDashboardResponseModel as Dashboard } from "./company-dashboard-models";
import { GET } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

type Actor = { userId: string; workspaceId: string; role: "owner" | "member" };

const TODAY = todayIn("Asia/Kolkata");
const PATH = `${TEST_ORIGIN}/api/construction/reporting/company-dashboard`;

function read(actor: Actor | null, query: Record<string, string> = {}) {
  if (actor == null) actAs({ userId: null, workspaceId: null });
  else actAs(actor);
  return GET(new Request(`${PATH}?${new URLSearchParams(query).toString()}`));
}

async function dashboard(
  actor: Actor,
  query: Record<string, string> = {},
): Promise<Dashboard> {
  const response = await read(actor, query);
  expect(response.status).toBe(StatusCodes.OK);
  return (await response.json()) as Dashboard;
}

const DASHBOARD_READ = { "reporting.project_dashboard": ["read"] } as Record<
  string,
  Flag[]
>;

/**
 * Three Projects: Tower and Villa with something in every figure, Plaza
 * empty and on hold; a deleted Project that never shows.
 */
async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
  const tower = await addProject(ws, by, "Tower A");
  const villa = await addProject(ws, by, "Villa B");
  const plaza = await addProject(ws, by, "Plaza C");
  await prisma.constructionProjectsProject.update({
    where: { id: plaza },
    data: { status: "on_hold" },
  });
  const gone = await addProject(ws, by, "Gone D");
  await prisma.constructionProjectsProject.update({
    where: { id: gone },
    data: { deletedAt: new Date(), deletedBy: by },
  });
  const { cashId } = await seededAccounts(ws);
  const contractor = await addContractor(ws, by, [tower, villa]);

  for (const [projectId, amount] of [
    [tower, 5_000_00n],
    [villa, 2_000_00n],
  ] as const) {
    await dashboardPurchaseRequest(ws, by, projectId);
    const sheet = await sharedAddWorksheetRow(ws, by, projectId);
    await dashboardSheetStatus("worksheet", sheet.id, "pending");
    await reportTransaction(ws, by, {
      accountId: cashId,
      projectId,
      date: TODAY,
      amount: 100n,
      status: "pending",
    });
    await trackingInspectionRow(ws, projectId, by);
    await dashboardLabourAttendance(ws, by, {
      projectId,
      date: TODAY,
      status: "present",
    });
    await reportInvoice(ws, by, {
      partyType: "contractor",
      partyId: contractor,
      projectId,
      date: TODAY,
      amount,
    });
  }
  await dashboardPurchaseRequest(ws, by, gone);

  const member = async (
    grants: Record<string, Flag[]>,
    projectIds: string[],
  ) => {
    const added = await addMember(ws, by, grants);
    for (const projectId of projectIds)
      await prisma.constructionOrganizationTeamMemberProject.create({
        data: { memberId: added.memberId, projectId },
      });
    return {
      actor: { userId: added.userId, workspaceId: ws, role: "member" } as Actor,
      memberId: added.memberId,
    };
  };
  return { ws, by, owner, tower, villa, plaza, member };
}

describe("Company Dashboard HTTP (CM-902)", () => {
  it("is 401 without a Session and 403 without Dashboard Read", async () => {
    expect((await read(null)).status).toBe(StatusCodes.UNAUTHORIZED);
    const s = await setup();
    const { actor } = await s.member({ "projects.project": ["read"] }, [
      s.tower,
    ]);
    const refused = await read(actor);
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await refused.json()).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("shows the Owner every live Project with every figure", async () => {
    const s = await setup();
    const view = await dashboard(s.owner);
    // The default duration is the last 12 months, ending the Company's today.
    const year = presetDuration("last_12_months", TODAY);
    expect(view).toMatchObject({
      today: TODAY,
      from: year.from,
      to: year.to,
      financial: true,
    });
    expect(view.projects.map((row) => row.name)).toEqual([
      "Tower A",
      "Villa B",
      "Plaza C",
    ]);
    expect(view.projects[0]).toEqual({
      id: s.tower,
      name: "Tower A",
      status: "ongoing",
      progress: null,
      // PR + worksheet + transaction.
      approvals: 3,
      pendingIssues: 0,
      delayedIssues: 0,
      pendingInspections: 1,
      labourToday: 1,
      due: 5_000_00,
    });
    expect(view.projects[2]).toMatchObject({
      status: "on_hold",
      approvals: 0,
      labourToday: 0,
      due: 0,
    });
    expect(view.totals).toEqual({
      activeProjects: 2,
      approvals: 6,
      pendingIssues: 0,
      pendingInspections: 2,
      labourToday: 2,
      amountDue: 7_000_00,
    });
  });

  it("lists only a Member's assigned Projects, with the figures their flags allow", async () => {
    const s = await setup();
    const { actor } = await s.member(
      {
        ...DASHBOARD_READ,
        "procurement.purchase_requests": ["read", "approve"],
        "tracking.inspection_requests": ["read"],
      },
      [s.tower],
    );
    const view = await dashboard(actor);
    expect(view.projects).toEqual([
      {
        id: s.tower,
        name: "Tower A",
        status: "ongoing",
        progress: null,
        approvals: 1,
        pendingIssues: null,
        delayedIssues: null,
        pendingInspections: 1,
        labourToday: null,
        due: null,
      },
    ]);
    expect(view.totals).toEqual({
      activeProjects: 1,
      approvals: 1,
      pendingIssues: null,
      pendingInspections: 1,
      labourToday: null,
      amountDue: null,
    });
    // Without Payments Read, no amounts anywhere.
    expect(view.financial).toBe(false);

    // A member on no Project sees an empty dashboard, not a refusal.
    const { actor: unassigned } = await s.member(DASHBOARD_READ, []);
    const empty = await dashboard(unassigned);
    expect(empty.projects).toEqual([]);
    expect(empty.totals.activeProjects).toBe(0);
  });

  it("shows amounts due with Payments Read and labour with Attendance Read", async () => {
    const s = await setup();
    const { actor } = await s.member(
      {
        ...DASHBOARD_READ,
        "finance.payments": ["read"],
        "labour.attendance": ["read"],
      },
      [s.tower, s.villa],
    );
    const view = await dashboard(actor);
    expect(view.financial).toBe(true);
    expect(
      view.projects.map((row) => [row.name, row.due, row.labourToday]),
    ).toEqual([
      ["Tower A", 5_000_00, 1],
      ["Villa B", 2_000_00, 1],
    ]);
    expect(view.totals).toMatchObject({
      amountDue: 7_000_00,
      labourToday: 2,
      // No Approve flag on any module.
      approvals: null,
    });
  });

  it("counts a Member's own and assigned issues without View all", async () => {
    const s = await setup();
    const issues = { ...DASHBOARD_READ, "tracking.issues": ["read"] } as Record<
      string,
      Flag[]
    >;
    const mine = await s.member(issues, [s.tower]);
    const all = await s.member(
      { ...DASHBOARD_READ, "tracking.issues": ["read", "view_all"] },
      [s.tower],
    );
    await trackingIssueRow(s.ws, s.tower, s.by);
    await trackingIssueRow(s.ws, s.tower, s.by, {
      assigneeMemberId: mine.memberId,
      issueDate: addDays(TODAY, -20),
      dueDate: addDays(TODAY, -1),
    });
    await trackingIssueRow(s.ws, s.tower, mine.actor.userId);
    await trackingIssueRow(s.ws, s.tower, s.by, { status: "solved" });
    // Outside a chosen duration.
    await trackingIssueRow(s.ws, s.tower, s.by, {
      issueDate: addDays(TODAY, -100),
    });

    const own = await dashboard(mine.actor);
    expect(own.projects[0]).toMatchObject({
      pendingIssues: 2,
      delayedIssues: 1,
      pendingInspections: null,
    });
    const everyone = await dashboard(all.actor);
    expect(everyone.projects[0]).toMatchObject({
      pendingIssues: 4,
      delayedIssues: 1,
    });
    const month = await dashboard(all.actor, {
      from: addDays(TODAY, -30),
      to: TODAY,
    });
    expect(month).toMatchObject({ from: addDays(TODAY, -30), to: TODAY });
    expect(month.projects[0]?.pendingIssues).toBe(3);
  });

  it("refuses half a duration or one that ends before it starts", async () => {
    const s = await setup();
    for (const query of [
      { from: TODAY },
      { to: TODAY },
      { from: TODAY, to: addDays(TODAY, -1) },
      { from: "16-10-2026", to: TODAY },
    ]) {
      const response = await read(s.owner, query);
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    }
  });

  it("is on /api/docs", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    expect(document.paths).toHaveProperty(
      "/api/construction/reporting/company-dashboard",
    );
  });
});
