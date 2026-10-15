import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { POST as recordProgress } from "@/app/api/construction/tracking/tasks/[id]/progress/route";
import { POST as createTask } from "@/app/api/construction/tracking/tasks/route";
import type { Flag } from "@/src/shared-kernel/access";
import {
  addDays,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import { addContractor } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";
import { trackingIssueRow } from "@/test/tracking";

import { GET as downloadReport } from "./[id]/download/route";
import type {
  ConstructionReportingReportJobResponseModel as Job,
  ListConstructionReportingReportsResponseModel as JobList,
} from "./report-models";
import { GET as listReports, POST as requestReport } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const TASKS = `${TEST_ORIGIN}/api/construction/tracking/tasks`;
const TODAY = todayIn("Asia/Kolkata");
const PERIOD = { from: addDays(TODAY, -30), to: TODAY };

type Actor = { userId: string; workspaceId: string; role: "owner" | "member" };

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function request(actor: Actor, body: unknown) {
  actAs(actor);
  return requestReport(post(BASE, body));
}

async function generate(actor: Actor, body: unknown): Promise<Job> {
  const response = await request(actor, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  const job = (await response.json()) as Job;
  expect(job.error).toBeNull();
  expect(job.status).toBe("done");
  return job;
}

async function workbook(actor: Actor, job: Job): Promise<ExcelJS.Workbook> {
  actAs(actor);
  const response = await downloadReport(
    new Request(`${BASE}/${job.id}/download?format=xlsx`),
    { params: Promise.resolve({ id: job.id }) },
  );
  expect(response.status).toBe(StatusCodes.OK);
  const book = new ExcelJS.Workbook();
  const bytes = Buffer.from(await bytesOf(response));
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return book;
}

async function pdfOk(actor: Actor, job: Job) {
  actAs(actor);
  const response = await downloadReport(
    new Request(`${BASE}/${job.id}/download?format=pdf`),
    { params: Promise.resolve({ id: job.id }) },
  );
  expect(response.status).toBe(StatusCodes.OK);
  const bytes = await bytesOf(response);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
}

function rowsOf(sheet: ExcelJS.Worksheet | undefined): unknown[][] {
  const rows: unknown[][] = [];
  sheet?.eachRow({ includeEmpty: true }, (row, number) => {
    rows[number - 1] = (row.values as unknown[]).slice(1);
  });
  return Array.from(rows, (row: unknown[] | undefined) => row ?? []);
}

function tableOf(sheet: ExcelJS.Worksheet | undefined, first: string) {
  const rows = rowsOf(sheet);
  const headerIndex = rows.findIndex((row) => row[0] === first);
  const header = (rows[headerIndex] ?? []) as string[];
  const body = rows.slice(headerIndex + 1);
  const totalsIndex = body.findIndex((row) => row[0] === "Total");
  const lines = totalsIndex < 0 ? body : body.slice(0, totalsIndex);
  const cell = (row: unknown[] | undefined, label: string) =>
    row?.[header.indexOf(label)];
  const find = (value: string) =>
    lines.find((row) =>
      row.some((item) => typeof item === "string" && item.includes(value)),
    );
  return {
    rows,
    header,
    lines,
    cell,
    find,
    totals: totalsIndex < 0 ? undefined : body[totalsIndex],
  };
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
  const projectId = await addProject(ws, by, "Tower A");
  const member = async (grants: Record<string, Flag[]>) => {
    const added = await addMember(ws, by, grants);
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId },
    });
    return {
      memberId: added.memberId,
      actor: { userId: added.userId, workspaceId: ws, role: "member" } as Actor,
    };
  };
  return { ws, by, owner, projectId, member };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function task(ctx: Ctx, body: Record<string, unknown>) {
  actAs(ctx.owner);
  const response = await createTask(
    post(TASKS, { projectId: ctx.projectId, ...body }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return ((await response.json()) as { id: string }).id;
}

async function progress(ctx: Ctx, id: string, pct: number) {
  actAs(ctx.owner);
  const response = await recordProgress(
    post(`${TASKS}/${id}/progress`, { progressDate: TODAY, progressPct: pct }),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(StatusCodes.CREATED);
}

describe("tracking reports HTTP (CM-805)", () => {
  it("Task Report: tree order, levels, dates, variance, progress and status; prices with Financial, leaf totals only", async () => {
    const ctx = await setup();
    const velan = await addContractor(ctx.ws, ctx.by, [ctx.projectId]);
    const site = await ctx.member({ "tracking.tasks": ["read", "report"] });
    const tower = await task(ctx, { name: "Tower structure" });
    const columns = await task(ctx, {
      name: "Columns",
      parentId: tower,
      startDate: addDays(TODAY, -20),
      dueDate: addDays(TODAY, -2),
      totalPrice: 600_000_00,
      contractorId: velan,
      assigneeIds: [site.memberId],
    });
    await task(ctx, {
      // Noto fonts: a Tamil name prints in the PDF (CM-805).
      name: "Slab கான்கிரீட்",
      parentId: tower,
      startDate: TODAY,
      dueDate: addDays(TODAY, 9),
      totalPrice: 400_000_00,
    });
    const old = await task(ctx, { name: "Survey", totalPrice: 50_000_00 });
    await prisma.constructionTrackingTask.update({
      where: { id: old },
      data: { createdAt: new Date(`${addDays(TODAY, -90)}T06:00:00Z`) },
    });
    await progress(ctx, columns, 50);

    const job = await generate(ctx.owner, {
      kind: "task_report",
      projectId: ctx.projectId,
      params: PERIOD,
    });
    expect(job.includesMoney).toBe(true);
    expect(job.title).toBe("Task Report");
    const book = await workbook(ctx.owner, job);
    const tasks = tableOf(book.worksheets[0], "Task No.");
    expect(tasks.header).toEqual([
      "Task No.",
      "Task",
      "Level",
      "Assignees",
      "Start Date",
      "Due Date",
      "Baseline Start",
      "Baseline End",
      "Actual Start",
      "Actual End",
      "Variance (days)",
      "Progress %",
      "Status",
      "Location",
      "Department",
      "Contractor",
      "Total Price",
      "Completed Price",
    ]);
    // Survey was added before the period.
    expect(tasks.lines.map((row) => row[0])).toEqual(["T-1", "T-2", "T-3"]);
    const columnsRow = tasks.find("Columns");
    expect(tasks.cell(columnsRow, "Task")).toBe("  Columns");
    expect(tasks.cell(columnsRow, "Level")).toBe(2);
    expect(tasks.cell(columnsRow, "Assignees")).toBe("Prabhu Saravanan");
    expect(tasks.cell(columnsRow, "Status")).toBe("Delayed");
    expect(tasks.cell(columnsRow, "Progress %")).toBe(50);
    // Forecast end is today, two days after the baseline end.
    expect(tasks.cell(columnsRow, "Variance (days)")).toBe(2);
    expect(tasks.cell(columnsRow, "Actual Start")).toBeTruthy();
    expect(tasks.cell(columnsRow, "Contractor")).toBeTruthy();
    expect(tasks.cell(columnsRow, "Total Price")).toBe(600_000);
    expect(tasks.cell(columnsRow, "Completed Price")).toBe(300_000);
    const summary = tasks.find("Tower structure");
    expect(tasks.cell(summary, "Total Price")).toBe(1_000_000);
    expect(tasks.cell(summary, "Status")).toBe("In Progress");
    // The summary's price is its leaves': counted once.
    expect(tasks.cell(tasks.totals, "Total Price")).toBe(1_000_000);
    expect(tasks.cell(tasks.totals, "Completed Price")).toBe(300_000);
    const statuses = tableOf(book.worksheets[1], "Status");
    expect(statuses.lines).toEqual([
      ["Not Started", 1],
      ["In Progress", 1],
      ["Delayed", 1],
      ["Completed", 0],
    ]);
    await pdfOk(ctx.owner, job);

    // Without Financial no price column; without View all, own tasks only.
    const mine = await generate(site.actor, {
      kind: "task_report",
      projectId: ctx.projectId,
      params: PERIOD,
    });
    expect(mine.includesMoney).toBe(false);
    const own = tableOf(
      (await workbook(site.actor, mine)).worksheets[0],
      "Task No.",
    );
    expect(own.header).not.toContain("Total Price");
    expect(own.lines.map((row) => row[0])).toEqual(["T-2"]);
    expect(
      own.rows.some((row) =>
        String(row[0]).startsWith("Only the tasks you created"),
      ),
    ).toBe(true);

    // The member does not see the owner's whole-Project report listed.
    actAs(site.actor);
    const listed = (await (
      await listReports(new Request(`${BASE}?projectId=${ctx.projectId}`))
    ).json()) as JobList;
    expect(listed.items.map((item) => item.id)).toEqual([mine.id]);
  });

  it("Issue & Snag Report: Delayed derived, solved on and by, closed on; own issues without View all", async () => {
    const ctx = await setup();
    const site = await ctx.member({ "tracking.issues": ["read", "report"] });
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      details: "Honeycombing in column C4",
      priority: "high",
      issueDate: addDays(TODAY, -6),
      dueDate: addDays(TODAY, -1),
      assigneeMemberId: site.memberId,
    });
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      details: "Missing cover blocks",
      status: "solved",
    });
    const closed = await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      details: "Loose railing",
      status: "solved",
    });
    await prisma.constructionTrackingIssue.update({
      where: { id: closed.id },
      data: { status: "closed", closedAt: new Date(), closedBy: ctx.by },
    });
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      details: "Last year's crack",
      issueDate: addDays(TODAY, -200),
    });

    const job = await generate(ctx.owner, {
      kind: "issue_snag_report",
      projectId: ctx.projectId,
      params: PERIOD,
    });
    expect(job.includesMoney).toBe(false);
    const book = await workbook(ctx.owner, job);
    const issues = tableOf(book.worksheets[0], "Number");
    expect(issues.header).toEqual([
      "Number",
      "Issue Date",
      "Details",
      "Priority",
      "Category",
      "Department",
      "Contractor",
      "Assigned To",
      "Due Date",
      "Location",
      "Status",
      "Solved On",
      "Solved By",
      "Closed On",
    ]);
    expect(issues.lines).toHaveLength(3);
    const delayed = issues.find("Honeycombing");
    expect(issues.cell(delayed, "Status")).toBe("Delayed");
    expect(issues.cell(delayed, "Priority")).toBe("High");
    expect(issues.cell(delayed, "Assigned To")).toBe("Prabhu Saravanan");
    const solved = issues.find("Missing cover blocks");
    expect(issues.cell(solved, "Status")).toBe("Solved");
    expect(issues.cell(solved, "Solved On")).toBeTruthy();
    expect(issues.cell(solved, "Solved By")).toBeTruthy();
    expect(issues.cell(issues.find("Loose railing"), "Closed On")).toBeTruthy();
    expect(tableOf(book.worksheets[1], "Status").lines).toEqual([
      ["Pending", 0],
      ["Delayed", 1],
      ["Solved", 1],
      ["Closed", 1],
    ]);
    await pdfOk(ctx.owner, job);

    const mine = await generate(site.actor, {
      kind: "issue_snag_report",
      projectId: ctx.projectId,
      params: PERIOD,
    });
    const own = tableOf(
      (await workbook(site.actor, mine)).worksheets[0],
      "Number",
    );
    expect(own.lines).toHaveLength(1);
  });

  it("Inspection Request Report: decided by and on, reason, re-inspection of and the Success Rate", async () => {
    const ctx = await setup();
    const now = new Date();
    const row = (
      status: "pending" | "approved" | "rejected",
      extra: { reinspectionOfId?: string; date?: string } = {},
    ) => {
      const id = randomUUID();
      return prisma.constructionTrackingInspection.create({
        data: {
          id,
          workspaceId: ctx.ws,
          projectId: ctx.projectId,
          number: `IR/26-27/${id.slice(0, 5)}`,
          inspectionDate: calendarDateToDb(extra.date ?? TODAY),
          inspectionTime: "10:30",
          workDescription: `Slab ${status}`,
          status,
          decidedAt: status === "pending" ? null : now,
          decidedBy: status === "pending" ? null : ctx.by,
          rejectionReason:
            status === "rejected" ? "Cover blocks missing" : null,
          reinspectionOfId: extra.reinspectionOfId ?? null,
          createdAt: now,
          updatedAt: now,
          createdBy: ctx.by,
          updatedBy: ctx.by,
        },
      });
    };
    const rejected = await row("rejected", { date: addDays(TODAY, -3) });
    await row("approved", { reinspectionOfId: rejected.id });
    await row("approved");
    await row("approved");
    await row("pending");
    await row("approved", { date: addDays(TODAY, -100) });

    const job = await generate(ctx.owner, {
      kind: "inspection_request_report",
      projectId: ctx.projectId,
      params: PERIOD,
    });
    const book = await workbook(ctx.owner, job);
    const table = tableOf(book.worksheets[0], "Request No");
    expect(table.header).toEqual([
      "Request No",
      "Date",
      "Time",
      "Department",
      "Contractor",
      "Inspector",
      "Description of work",
      "Location",
      "Status",
      "Decided By",
      "Decided On",
      "Reason",
      "Re-inspection of",
    ]);
    expect(table.lines).toHaveLength(5);
    const first = table.lines[0];
    expect(table.cell(first, "Status")).toBe("Rejected");
    expect(table.cell(first, "Reason")).toBe("Cover blocks missing");
    expect(table.cell(first, "Time")).toBe("10:30");
    expect(table.cell(first, "Decided On")).toBeTruthy();
    expect(
      table.lines.some(
        (line) => table.cell(line, "Re-inspection of") === rejected.number,
      ),
    ).toBe(true);
    expect(
      table.rows.some(
        (line) => line[0] === "Success Rate: 75% (approved of 4 decided).",
      ),
    ).toBe(true);
    await pdfOk(ctx.owner, job);
  });

  it("needs each kind's Report flag on its menu; the Task Progress Report is not requested here", async () => {
    const ctx = await setup();
    const reader = await ctx.member({
      "tracking.tasks": ["read"],
      "tracking.issues": ["read"],
      "tracking.inspection_requests": ["read"],
    });
    for (const kind of [
      "task_report",
      "issue_snag_report",
      "inspection_request_report",
    ])
      expect(
        (
          await request(reader.actor, {
            kind,
            projectId: ctx.projectId,
            params: PERIOD,
          })
        ).status,
      ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (
        await request(ctx.owner, {
          kind: "task_progress_report",
          projectId: ctx.projectId,
          params: PERIOD,
        })
      ).status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });
});
