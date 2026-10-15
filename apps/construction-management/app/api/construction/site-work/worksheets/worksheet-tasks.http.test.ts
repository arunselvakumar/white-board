import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as taskActivity } from "@/app/api/construction/tracking/tasks/[id]/activity/route";
import { GET as taskProgress } from "@/app/api/construction/tracking/tasks/[id]/progress/route";
import { GET as getTask } from "@/app/api/construction/tracking/tasks/[id]/route";
import { POST as bulkDeleteTasks } from "@/app/api/construction/tracking/tasks/bulk-delete/route";
import { POST as removeTaskProgress } from "@/app/api/construction/tracking/tasks/progress/[progressId]/delete/route";
import { POST as createTask } from "@/app/api/construction/tracking/tasks/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addProject, newCompany } from "@/test/companies";
import { addUnit } from "@/test/procurement";
import { worksheetContractor, worksheetDepartment } from "@/test/site-work";

import { POST as saveSettings } from "../settings/worksheets/route";
import { POST as approve } from "./[id]/approve/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as reject } from "./[id]/reject/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as list, POST as create } from "./route";
import { GET as taskOptions } from "./task-options/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

/** Daily Worksheets feed task progress (CM-806, ADR CM-0019 §6). */

const ORIGIN = "http://localhost";
const BASE = `${ORIGIN}/api/construction/site-work/worksheets`;
const TASKS = `${ORIGIN}/api/construction/tracking/tasks`;
const TODAY = todayIn("Asia/Kolkata");

type SheetTask = {
  id: string;
  taskNo: number | null;
  name: string | null;
  unitName: string | null;
  posting: string | null;
};
type Sheet = {
  id: string;
  number: string;
  approvalStatus: string;
  updatedAt: string;
  task: SheetTask | null;
};
type Task = {
  progressPct: number;
  completedWorkQty: string | null;
  status: string;
  actualStart: string | null;
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function code(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const projectId = await addProject(ws, by, "Anugraha Towers");
  const department = await worksheetDepartment(ws, by, { name: "Concrete" });
  const contractor = await worksheetContractor(ws, by, {
    name: "Velan Constructions",
    projectIds: [projectId],
    departmentIds: [department],
  });
  const cum = await addUnit(ws, by, "cum");
  const sqm = await addUnit(ws, by, "sqm");
  actAs({ userId: by, workspaceId: ws, role: "owner" });
  const task = async (body: Record<string, unknown>, project = projectId) => {
    const response = await createTask(
      post(TASKS, { projectId: project, ...body }),
    );
    expect(response.status, await response.clone().text()).toBe(
      StatusCodes.CREATED,
    );
    return (await json<{ id: string }>(response)).id;
  };
  const slab = await task({
    name: "First floor slab",
    totalWorkQty: "100",
    totalWorkUnitId: cum,
  });
  const beams = await task({
    name: "Plinth beams",
    totalWorkQty: "40",
    totalWorkUnitId: cum,
  });
  const plaster = await task({ name: "Plastering" });
  return {
    ws,
    by,
    projectId,
    department,
    contractor,
    cum,
    sqm,
    slab,
    beams,
    plaster,
    task,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

function body(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return {
    projectId: ctx.projectId,
    sheetDate: TODAY,
    shift: "shift_1",
    contractorId: ctx.contractor,
    departmentId: ctx.department,
    skilledCount: 4,
    unskilledCount: 6,
    approxWorkQty: "12.5",
    approxWorkUnitId: ctx.cum,
    taskId: ctx.slab,
    ...patch,
  };
}

async function saved(ctx: Ctx, patch: Record<string, unknown> = {}) {
  const response = await create(post(BASE, body(ctx, patch)));
  expect(response.status, await response.clone().text()).toBe(
    StatusCodes.CREATED,
  );
  return json<Sheet>(response);
}

async function edit(ctx: Ctx, sheet: Sheet, patch: Record<string, unknown>) {
  const { projectId: _projectId, ...rest } = body(ctx, patch);
  const response = await update(
    post(`${BASE}/${sheet.id}/update`, {
      ...rest,
      expectedUpdatedAt: sheet.updatedAt,
    }),
    params(sheet.id),
  );
  expect(response.status, await response.clone().text()).toBe(StatusCodes.OK);
  return json<Sheet>(response);
}

async function task(id: string): Promise<Task> {
  return json<Task>(await getTask(new Request(`${TASKS}/${id}`), params(id)));
}

async function updates(id: string) {
  return (
    await json<{
      items: {
        id: string;
        workQty: string | null;
        progressDate: string;
        source: string;
        worksheet: { id: string; number: string | null } | null;
        actions: { edit: boolean; delete: boolean };
      }[];
    }>(await taskProgress(new Request(`${TASKS}/${id}/progress`), params(id)))
  ).items;
}

async function setApproval(ctx: Ctx, approvalEnabled: boolean) {
  const response = await saveSettings(
    post(`${ORIGIN}/api/construction/site-work/settings/worksheets`, {
      projectId: ctx.projectId,
      showLocation: true,
      showWorkType: true,
      showApproxWorkDone: true,
      showLabour: true,
      showMaterials: true,
      showRemark: true,
      showPhotos: true,
      sectionOrder: ["location", "basic", "materials", "other"],
      approvalEnabled,
    }),
  );
  expect(response.status).toBe(StatusCodes.OK);
}

describe("Daily Worksheets feed task progress (CM-806)", () => {
  it("posts Approx Work Done to a task in the same unit", async () => {
    const ctx = await setup();
    const sheet = await saved(ctx, { sheetDate: addDays(TODAY, -1) });
    expect(sheet.task).toMatchObject({
      id: ctx.slab,
      taskNo: 1,
      name: "First floor slab",
      unitName: "cum",
      posting: "quantity",
    });
    expect(await task(ctx.slab)).toMatchObject({
      completedWorkQty: "12.5",
      progressPct: 12.5,
      status: "in_progress",
      actualStart: addDays(TODAY, -1),
    });
    const [row] = await updates(ctx.slab);
    expect(row).toMatchObject({
      workQty: "12.5",
      source: "worksheet",
      worksheet: { id: sheet.id, number: sheet.number },
      actions: { edit: false, delete: false },
    });
    // Not editable on the task.
    if (row == null) throw new Error("an update");
    const refused = await removeTaskProgress(
      post(`${TASKS}/progress/${row.id}/delete`, {}),
      { params: Promise.resolve({ progressId: row.id }) },
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await code(refused)).toBe("PROGRESS_FROM_WORKSHEET");
    const feed = await json<{ items: { kind: string }[] }>(
      await taskActivity(
        new Request(`${TASKS}/${ctx.slab}/activity`),
        params(ctx.slab),
      ),
    );
    expect(feed.items.map((item) => item.kind)).toContain("worksheet_progress");
    // The list shows the task too.
    const page = await json<{ items: Sheet[] }>(
      await list(new Request(`${BASE}?projectId=${ctx.projectId}`)),
    );
    expect(page.items[0]?.task?.id).toBe(ctx.slab);
  });

  it("only links a task in another unit, a percent task, or a sheet without work done", async () => {
    const ctx = await setup();
    const otherUnit = await saved(ctx, { approxWorkUnitId: ctx.sqm });
    expect(otherUnit.task?.posting).toBe("linked_unit");
    const percent = await saved(ctx, { taskId: ctx.plaster });
    expect(percent.task?.posting).toBe("linked_percent");
    const none = await saved(ctx, {
      approxWorkQty: null,
      approxWorkUnitId: null,
    });
    expect(none.task?.posting).toBe("linked_no_quantity");
    expect(await updates(ctx.slab)).toEqual([]);
    expect(await updates(ctx.plaster)).toEqual([]);
    expect((await task(ctx.slab)).progressPct).toBe(0);
  });

  it("replaces the update on edit: quantity, date, another task, another unit", async () => {
    const ctx = await setup();
    let sheet = await saved(ctx);
    sheet = await edit(ctx, sheet, {
      approxWorkQty: "20",
      sheetDate: addDays(TODAY, -2),
    });
    expect(await updates(ctx.slab)).toMatchObject([
      { workQty: "20", progressDate: addDays(TODAY, -2) },
    ]);
    sheet = await edit(ctx, sheet, { approxWorkQty: "20", taskId: ctx.beams });
    expect((await task(ctx.slab)).progressPct).toBe(0);
    expect(await updates(ctx.slab)).toEqual([]);
    expect(await task(ctx.beams)).toMatchObject({
      completedWorkQty: "20",
      progressPct: 50,
    });
    sheet = await edit(ctx, sheet, {
      taskId: ctx.beams,
      approxWorkUnitId: ctx.sqm,
    });
    expect(sheet.task?.posting).toBe("linked_unit");
    expect((await task(ctx.beams)).progressPct).toBe(0);
    // Clearing the task.
    sheet = await edit(ctx, sheet, { taskId: null });
    expect(sheet.task).toBeNull();
  });

  it("removes the update when the sheet is deleted", async () => {
    const ctx = await setup();
    const sheet = await saved(ctx, { approxWorkQty: "100" });
    expect((await task(ctx.slab)).status).toBe("completed");
    const response = await remove(
      post(`${BASE}/${sheet.id}/delete`, {
        expectedUpdatedAt: sheet.updatedAt,
      }),
      params(sheet.id),
    );
    expect(response.status).toBe(StatusCodes.NO_CONTENT);
    expect(await task(ctx.slab)).toMatchObject({
      progressPct: 0,
      status: "not_started",
    });
    expect(await updates(ctx.slab)).toEqual([]);
  });

  it("counts pending and approved sheets; rejecting removes, editing back to pending posts again", async () => {
    const ctx = await setup();
    await setApproval(ctx, true);
    let sheet = await saved(ctx);
    expect(sheet.approvalStatus).toBe("pending");
    expect((await task(ctx.slab)).progressPct).toBe(12.5);
    const approved = await approve(
      post(`${BASE}/${sheet.id}/approve`, {}),
      params(sheet.id),
    );
    expect(approved.status, await approved.clone().text()).toBe(StatusCodes.OK);
    expect((await task(ctx.slab)).progressPct).toBe(12.5);
    const second = await saved(ctx, { approxWorkQty: "7.5" });
    expect((await task(ctx.slab)).progressPct).toBe(20);
    const rejected = await reject(
      post(`${BASE}/${second.id}/reject`, { reason: "Quantity not measured" }),
      params(second.id),
    );
    expect(rejected.status, await rejected.clone().text()).toBe(StatusCodes.OK);
    expect((await task(ctx.slab)).progressPct).toBe(12.5);
    sheet = await json<Sheet>(
      await getOne(new Request(`${BASE}/${second.id}`), params(second.id)),
    );
    expect(sheet.approvalStatus).toBe("rejected");
    const back = await edit(ctx, sheet, { approxWorkQty: "7.5" });
    expect(back.approvalStatus).toBe("pending");
    expect((await task(ctx.slab)).progressPct).toBe(20);
  });

  it("refuses a summary task and another Project's task", async () => {
    const ctx = await setup();
    const parent = await ctx.task({ name: "Tower A" });
    await ctx.task({ name: "Columns", parentId: parent });
    const summary = await create(post(BASE, body(ctx, { taskId: parent })));
    expect(summary.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(summary)).toBe("WORKSHEET_TASK_IS_SUMMARY");
    const elsewhere = await addProject(ctx.ws, ctx.by, "Other site");
    const foreign = await ctx.task({ name: "Elsewhere" }, elsewhere);
    const other = await create(post(BASE, body(ctx, { taskId: foreign })));
    expect(other.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(other)).toBe("WORKSHEET_TASK_NOT_FOUND");
  });

  it("keeps a named task from being deleted", async () => {
    const ctx = await setup();
    const sheet = await saved(ctx);
    const refused = await bulkDeleteTasks(
      post(`${TASKS}/bulk-delete`, {
        projectId: ctx.projectId,
        ids: [ctx.slab],
      }),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json<{ details: unknown }>(refused)).toMatchObject({
      code: "TASK_IN_USE",
      details: { worksheetCount: 1 },
    });
    await remove(
      post(`${BASE}/${sheet.id}/delete`, {
        expectedUpdatedAt: sheet.updatedAt,
      }),
      params(sheet.id),
    );
    const done = await bulkDeleteTasks(
      post(`${TASKS}/bulk-delete`, {
        projectId: ctx.projectId,
        ids: [ctx.slab],
      }),
    );
    expect(done.status).toBe(StatusCodes.OK);
  });

  it("keeps a linked-only task from getting sub-tasks", async () => {
    const ctx = await setup();
    // Plastering tracks percent, so the sheet links it without progress.
    await saved(ctx, { taskId: ctx.plaster });
    const refused = await createTask(
      post(TASKS, {
        projectId: ctx.projectId,
        parentId: ctx.plaster,
        name: "Slab shuttering",
      }),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json<{ details: unknown }>(refused)).toMatchObject({
      code: "TASK_IN_USE",
      details: { worksheetCount: 1 },
    });
  });

  it("offers live leaf tasks of the Project by number and name", async () => {
    const ctx = await setup();
    const parent = await ctx.task({ name: "Tower A" });
    await ctx.task({ name: "Columns", parentId: parent });
    const names = async (query: string) =>
      (
        await json<{ items: { taskNo: number; name: string }[] }>(
          await taskOptions(
            new Request(
              `${BASE}/task-options?projectId=${ctx.projectId}${query}`,
            ),
          ),
        )
      ).items.map((item) => `T-${String(item.taskNo)} ${item.name}`);
    expect(await names("")).toEqual([
      "T-1 First floor slab",
      "T-2 Plinth beams",
      "T-3 Plastering",
      "T-5 Columns",
    ]);
    expect(await names("&search=T-2")).toEqual(["T-2 Plinth beams"]);
    expect(await names("&search=col")).toEqual(["T-5 Columns"]);
    await prisma.constructionTrackingTask.update({
      where: { id: ctx.plaster },
      data: { deletedAt: new Date(), deletedBy: ctx.by },
    });
    expect(await names("&search=plaster")).toEqual([]);
  });

  it("is on /api/docs", async () => {
    const doc = await json<{ paths: Record<string, unknown> }>(getOpenApi());
    expect(
      doc.paths["/api/construction/site-work/worksheets/task-options"],
    ).toBeDefined();
  });
});
