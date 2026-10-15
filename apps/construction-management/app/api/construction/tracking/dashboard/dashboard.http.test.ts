import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import {
  addDays,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";
import { trackingIssueRow } from "@/test/tracking";

import { POST as recordProgress } from "../tasks/[id]/progress/route";
import { GET as getTask } from "../tasks/[id]/route";
import { POST as updateTask } from "../tasks/[id]/update/route";
import { POST as createTask } from "../tasks/route";
import type { GetConstructionTrackingDashboardResponseModel as Dashboard } from "./dashboard-models";
import { GET } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

type Actor = { userId: string; workspaceId: string; role: "owner" | "member" };

const TODAY = todayIn("Asia/Kolkata");
const DURATION = { from: addDays(TODAY, -30), to: TODAY };
const TASKS = `${TEST_ORIGIN}/api/construction/tracking/tasks`;

function read(
  actor: Actor,
  projectId: string,
  range: { from: string; to: string } = DURATION,
) {
  actAs(actor);
  const query = new URLSearchParams({ projectId, ...range });
  return GET(
    new Request(
      `${TEST_ORIGIN}/api/construction/tracking/dashboard?${query.toString()}`,
    ),
  );
}

async function dashboard(
  actor: Actor,
  projectId: string,
  range?: { from: string; to: string },
): Promise<Dashboard> {
  const response = await read(actor, projectId, range);
  expect(response.status).toBe(StatusCodes.OK);
  return (await response.json()) as Dashboard;
}

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

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
      actor: {
        userId: added.userId,
        workspaceId: ws,
        role: "member",
      } as Actor,
    };
  };
  return { ws, by, owner, projectId, member };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function task(
  ctx: Ctx,
  body: Record<string, unknown>,
  as: Actor = ctx.owner,
): Promise<string> {
  actAs(as);
  const response = await createTask(
    post(TASKS, { projectId: ctx.projectId, ...body }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return ((await response.json()) as { id: string }).id;
}

async function progress(ctx: Ctx, id: string, pct: number) {
  actAs(ctx.owner);
  const response = await recordProgress(
    post(`${TASKS}/${id}/progress`, {
      progressDate: TODAY,
      progressPct: pct,
    }),
    params(id),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
}

async function inspection(
  ctx: Ctx,
  status: "pending" | "approved" | "rejected",
  inspectionDate = TODAY,
) {
  const id = randomUUID();
  const now = new Date();
  await prisma.constructionTrackingInspection.create({
    data: {
      id,
      workspaceId: ctx.ws,
      projectId: ctx.projectId,
      number: `IR/TEST/${id.slice(0, 8)}`,
      inspectionDate: calendarDateToDb(inspectionDate),
      workDescription: "Slab reinforcement before the pour",
      status,
      decidedAt: status === "pending" ? null : now,
      decidedBy: status === "pending" ? null : ctx.by,
      rejectionReason: status === "rejected" ? "Cover blocks missing" : null,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.by,
      updatedBy: ctx.by,
    },
  });
  return id;
}

describe("tracking dashboard HTTP (CM-805)", () => {
  it("weighs Project Progress % by Total Price, then by duration once a leaf loses its price", async () => {
    const ctx = await setup();
    const tower = await task(ctx, { name: "Tower structure" });
    const columns = await task(ctx, {
      name: "Columns",
      parentId: tower,
      startDate: addDays(TODAY, -5),
      dueDate: addDays(TODAY, 4),
      totalPrice: 600_000_00,
    });
    await task(ctx, {
      name: "Slab",
      parentId: tower,
      startDate: TODAY,
      dueDate: addDays(TODAY, 9),
      totalPrice: 400_000_00,
    });
    const footings = await task(ctx, {
      name: "Footings",
      startDate: addDays(TODAY, -20),
      dueDate: addDays(TODAY, -10),
      totalPrice: 100_000_00,
    });
    await progress(ctx, columns, 50);
    await progress(ctx, footings, 20);

    const priced = await dashboard(ctx.owner, ctx.projectId);
    // (6,00,000 × 50 % + 4,00,000 × 0 + 1,00,000 × 20 %) ÷ 11,00,000.
    expect(priced.tasks?.progress).toEqual({ pct: 29.09, weighting: "price" });
    expect(priced.tasks?.total).toBe(4);
    expect(priced.tasks?.byStatus).toEqual({
      not_started: 1,
      in_progress: 2,
      delayed: 1,
      completed: 0,
    });
    expect(priced.tasks?.mostDelayed).toEqual([
      {
        id: footings,
        taskNo: 4,
        label: "T-4",
        name: "Footings",
        dueDate: addDays(TODAY, -10),
        daysLate: 10,
        progressPct: 20,
      },
    ]);
    expect(priced.tasks?.valueEarned).toEqual({
      tasks: [
        {
          id: tower,
          taskNo: 1,
          label: "T-1",
          name: "Tower structure",
          value: 1_000_000_00,
          earned: 300_000_00,
        },
        {
          id: footings,
          taskNo: 4,
          label: "T-4",
          name: "Footings",
          value: 100_000_00,
          earned: 20_000_00,
        },
      ],
      more: 0,
      totals: { value: 1_100_000_00, earned: 320_000_00 },
    });

    // Footings loses its price: planned days weigh instead (10, 10, 11).
    actAs(ctx.owner);
    const loaded = (await (
      await getTask(new Request(`${TASKS}/${footings}`), params(footings))
    ).json()) as { updatedAt: string };
    const edited = await updateTask(
      post(`${TASKS}/${footings}/update`, {
        name: "Footings",
        startDate: addDays(TODAY, -20),
        dueDate: addDays(TODAY, -10),
        totalPrice: null,
        expectedUpdatedAt: loaded.updatedAt,
      }),
      params(footings),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const timed = await dashboard(ctx.owner, ctx.projectId);
    // (10 × 50 % + 10 × 0 + 11 × 20 %) ÷ 31.
    expect(timed.tasks?.progress).toEqual({
      pct: 23.23,
      weighting: "duration",
    });
    expect(timed.tasks?.valueEarned?.tasks.map((t) => t.id)).toEqual([tower]);
    expect(timed.tasks?.valueEarned?.totals).toEqual({
      value: 1_000_000_00,
      earned: 300_000_00,
    });
  });

  it("follows the duration: tasks by created date, issues by Issue Date, inspections by Inspection Date; progress stays whole-Project", async () => {
    const ctx = await setup();
    const old = await task(ctx, { name: "Excavation" });
    await progress(ctx, old, 100);
    await prisma.constructionTrackingTask.update({
      where: { id: old },
      data: { createdAt: new Date(`${addDays(TODAY, -400)}T06:00:00Z`) },
    });
    await task(ctx, { name: "Brickwork" });
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      issueDate: addDays(TODAY, -60),
    });
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      issueDate: addDays(TODAY, -3),
    });
    await inspection(ctx, "approved", addDays(TODAY, -90));
    await inspection(ctx, "pending", addDays(TODAY, -2));

    const view = await dashboard(ctx.owner, ctx.projectId);
    expect(view.tasks?.total).toBe(1);
    expect(view.tasks?.byStatus.not_started).toBe(1);
    expect(view.tasks?.byStatus.completed).toBe(0);
    // Project Progress % covers every leaf task, not only the period's.
    expect(view.tasks?.progress).toEqual({ pct: 50, weighting: "duration" });
    expect(view.issues?.total).toBe(1);
    expect(view.inspections).toEqual({
      total: 1,
      approved: 0,
      pending: 1,
      rejected: 0,
      successRate: null,
    });
    expect(view.kpis).toEqual({ pendingIssues: 1, pendingInspections: 1 });

    const wide = await dashboard(ctx.owner, ctx.projectId, {
      from: addDays(TODAY, -400),
      to: TODAY,
    });
    expect(wide.tasks?.total).toBe(2);
    expect(wide.tasks?.byStatus.completed).toBe(1);
    expect(wide.issues?.total).toBe(2);
    expect(wide.inspections?.total).toBe(2);
    expect(wide.inspections?.successRate).toBe(100);
  });

  it("counts issues by status, priority, category and assignee; Pending Issues & Snags counts the delayed too", async () => {
    const ctx = await setup();
    const ravi = await ctx.member({});
    // Every Company is seeded with the 14 Issue Categories (CM-0019 §1).
    const seeded = await prisma.constructionMastersIssueCategory.findMany({
      where: { workspaceId: ctx.ws, name: { in: ["Quality", "Safety"] } },
      select: { id: true, name: true },
    });
    const categoryId = (name: string) =>
      seeded.find((row) => row.name === name)?.id ?? "";
    const quality = categoryId("Quality");
    const safety = categoryId("Safety");
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      priority: "high",
      categoryId: quality,
      assigneeMemberId: ravi.memberId,
    });
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      issueDate: addDays(TODAY, -5),
      dueDate: addDays(TODAY, -1),
      priority: "medium",
      categoryId: quality,
      assigneeMemberId: ravi.memberId,
    });
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      status: "solved",
      priority: "low",
      categoryId: safety,
    });
    const closed = await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      status: "solved",
      categoryId: safety,
    });
    await prisma.constructionTrackingIssue.update({
      where: { id: closed.id },
      data: { status: "closed", closedAt: new Date(), closedBy: ctx.by },
    });
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, { deleted: true });

    const view = await dashboard(ctx.owner, ctx.projectId);
    expect(view.issues).toEqual({
      total: 4,
      byStatus: { pending: 1, delayed: 1, solved: 1, closed: 1 },
      byPriority: { high: 1, medium: 1, low: 1, none: 1 },
      byCategory: [
        { categoryId: quality, name: "Quality", count: 2 },
        { categoryId: safety, name: "Safety", count: 2 },
      ],
      byAssignee: [
        {
          memberId: ravi.memberId,
          name: "Prabhu Saravanan",
          total: 2,
          pending: 1,
          delayed: 1,
          solved: 0,
          closed: 0,
        },
        {
          memberId: null,
          name: null,
          total: 2,
          pending: 0,
          delayed: 0,
          solved: 1,
          closed: 1,
        },
      ],
      viewAll: true,
    });
    expect(view.kpis.pendingIssues).toBe(2);
  });

  it("counts inspections and the Success Rate, — with no decided request", async () => {
    const ctx = await setup();
    const empty = await dashboard(ctx.owner, ctx.projectId);
    expect(empty.inspections).toEqual({
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      successRate: null,
    });
    expect(empty.tasks).toMatchObject({
      progress: { pct: null, weighting: null },
      total: 0,
      mostDelayed: [],
      valueEarned: { tasks: [], more: 0, totals: { value: 0, earned: 0 } },
    });
    for (const status of ["approved", "approved", "approved"] as const)
      await inspection(ctx, status);
    await inspection(ctx, "rejected");
    await inspection(ctx, "pending");
    await inspection(ctx, "pending");
    const view = await dashboard(ctx.owner, ctx.projectId);
    expect(view.inspections).toEqual({
      total: 6,
      approved: 3,
      pending: 2,
      rejected: 1,
      successRate: 75,
    });
    expect(view.kpis.pendingInspections).toBe(2);
  });

  it("masks value without Task Financial, scopes without View all and leaves out sections without Read", async () => {
    const ctx = await setup();
    const site = await ctx.member({
      "reporting.project_dashboard": ["read"],
      "tracking.tasks": ["read"],
      "tracking.issues": ["read"],
    });
    const mine = await task(ctx, {
      name: "Plastering",
      assigneeIds: [site.memberId],
      totalPrice: 50_000_00,
    });
    await task(ctx, { name: "Painting", totalPrice: 80_000_00 });
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      assigneeMemberId: site.memberId,
    });
    await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {});
    await trackingIssueRow(ctx.ws, ctx.projectId, site.actor.userId, {});

    const scoped = await dashboard(site.actor, ctx.projectId);
    expect(scoped.tasks).toMatchObject({
      total: 1,
      viewAll: false,
      valueEarned: null,
      // The Project's progress is the Project's, as on its card.
      progress: { pct: 0, weighting: "price" },
    });
    expect(scoped.issues).toMatchObject({ total: 2, viewAll: false });
    expect(scoped.inspections).toBeNull();
    expect(scoped.kpis).toEqual({
      pendingIssues: 2,
      pendingInspections: null,
    });

    const lead = await ctx.member({
      "reporting.project_dashboard": ["read"],
      "tracking.tasks": ["read", "view_all", "financial"],
    });
    const full = await dashboard(lead.actor, ctx.projectId);
    expect(full.tasks?.total).toBe(2);
    expect(full.tasks?.valueEarned?.totals).toEqual({
      value: 130_000_00,
      earned: 0,
    });
    expect(full.tasks?.valueEarned?.tasks.map((t) => t.id)).toContain(mine);
    expect(full.issues).toBeNull();
    expect(full.kpis.pendingIssues).toBeNull();

    const outsider = await ctx.member({ "tracking.tasks": ["read"] });
    expect((await read(outsider.actor, ctx.projectId)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("refuses a bad duration and is on /api/docs", async () => {
    const ctx = await setup();
    const response = await read(ctx.owner, ctx.projectId, {
      from: TODAY,
      to: addDays(TODAY, -1),
    });
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    expect(document.paths).toHaveProperty(
      "/api/construction/tracking/dashboard",
    );
  });
});
