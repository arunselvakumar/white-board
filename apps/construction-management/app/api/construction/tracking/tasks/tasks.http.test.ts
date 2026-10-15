import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addContractor, addUnit } from "@/test/procurement";
import { sharedAddWorksheetRow } from "@/test/site-work";
import { failGalleryRemovals, trackingMaster } from "@/test/tracking";

import { uploadTrackingFile, WEBP } from "../documents/document-test-fixtures";
import { GET as activity } from "./[id]/activity/route";
import { POST as complete } from "./[id]/complete/route";
import { POST as copy } from "./[id]/copy/route";
import { POST as removeOne } from "./[id]/delete/route";
import { GET as progressList, POST as record } from "./[id]/progress/route";
import { POST as rebaseline } from "./[id]/rebaseline/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { POST as bulkDelete } from "./bulk-delete/route";
import { GET as formOptions } from "./form-options/route";
import { GET as gantt } from "./gantt/route";
import { POST as removeProgress } from "./progress/[progressId]/delete/route";
import { POST as editProgress } from "./progress/[progressId]/update/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/tracking/tasks";
const TODAY = todayIn("Asia/Kolkata");
const MENU = "tracking.tasks";

type Task = {
  id: string;
  taskNo: number;
  label: string;
  parentId: string | null;
  depth: number;
  sortOrder: number;
  name: string;
  isSummary: boolean;
  descendantCount: number;
  startDate: string | null;
  dueDate: string | null;
  kind: string | null;
  totalWorkQty: string | null;
  completedWorkQty: string | null;
  progressPct: number;
  status: string;
  weighting: string | null;
  totalPrice: number | null;
  completedPrice: number | null;
  baselineStart: string | null;
  baselineEnd: string | null;
  baselineDuration: number | null;
  baselineVersion: number;
  variance: number | null;
  actualStart: string | null;
  actualEnd: string | null;
  contextOnly: boolean;
  matched: boolean;
  assignees: { id: string; name: string | null }[];
  updatedAt: string;
  actions: { edit: boolean; delete: boolean; addSubTask: boolean };
};
type Detail = Task & {
  children: Task[];
  parents: { id: string; taskNo: number }[];
  baselines: { version: number; startDate: string; reason: string | null }[];
};
type Page = {
  items: Task[];
  total: number;
  nextCursor: string | null;
  prevCursor: string | null;
};
type Progress = {
  id: string;
  workQty: string | null;
  progressPct: number | null;
  updatedAt: string;
  actions: { edit: boolean; delete: boolean };
};
type ErrorBody = { code: string; details?: Record<string, unknown> };

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const progressParams = (progressId: string) => ({
  params: Promise.resolve({ progressId }),
});

function post(path: string, body: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const get = (path: string) => new Request(`${BASE}${path}`);

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function setup() {
  const company = await newCompany();
  const owner = {
    userId: company.ownerId,
    workspaceId: company.workspaceId,
    role: "owner" as const,
  };
  const projectId = await addProject(company.workspaceId, company.ownerId);
  const unitId = await addUnit(company.workspaceId, company.ownerId, "Cum");
  actAs(owner);
  return { company, owner, projectId, unitId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.company.workspaceId, ctx.company.ownerId, {
    [MENU]: flags,
  });
  if (onProject)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId: ctx.projectId },
    });
  return {
    memberId: added.memberId,
    session: {
      userId: added.userId,
      workspaceId: ctx.company.workspaceId,
      role: "member" as const,
    },
  };
}

async function add(
  ctx: Ctx,
  patch: Record<string, unknown> = {},
): Promise<string> {
  const response = await create(
    post("", { projectId: ctx.projectId, name: "Slab casting", ...patch }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return (await json<{ id: string }>(response)).id;
}

async function detail(id: string): Promise<Detail> {
  const response = await getOne(get(`/${id}`), params(id));
  expect(response.status).toBe(StatusCodes.OK);
  return json<Detail>(response);
}

async function page(ctx: Ctx, query = ""): Promise<Page> {
  const response = await list(get(`?projectId=${ctx.projectId}&${query}`));
  expect(response.status).toBe(StatusCodes.OK);
  return json<Page>(response);
}

async function progress(id: string, body: Record<string, unknown>) {
  return record(post(`/${id}/progress`, body), params(id));
}

async function codeOf(response: Response): Promise<string> {
  return (await json<ErrorBody>(response)).code;
}

describe("Tasks", () => {
  it("numbers tasks per Project, builds three levels and refuses a fourth", async () => {
    const ctx = await setup();
    const root = await add(ctx, { name: "Tower A structure" });
    const child = await add(ctx, { name: "Ground floor", parentId: root });
    const grandchild = await add(ctx, { name: "Columns", parentId: child });
    const deeper = await create(
      post("", {
        projectId: ctx.projectId,
        name: "Too deep",
        parentId: grandchild,
      }),
    );
    expect(deeper.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(deeper)).toBe("TASK_TOO_DEEP");
    const top = await detail(root);
    expect(top).toMatchObject({
      taskNo: 1,
      label: "T-1",
      depth: 1,
      isSummary: true,
      descendantCount: 2,
      kind: null,
    });
    expect(top.children.map((c) => c.id)).toEqual([child]);
    const leaf = await detail(grandchild);
    expect(leaf).toMatchObject({ taskNo: 3, depth: 3, kind: "percent" });
    expect(leaf.parents.map((p) => p.taskNo)).toEqual([1, 2]);
    expect(leaf.actions.addSubTask).toBe(false);
    // Another Project starts at 1 again.
    const other = await addProject(ctx.company.workspaceId, ctx.owner.userId);
    const response = await create(
      post("", { projectId: other, name: "Site clearing" }),
    );
    const otherId = (await json<{ id: string }>(response)).id;
    expect((await detail(otherId)).taskNo).toBe(1);
    // The feed of the parent names the sub-task.
    const feed = await json<{ items: { kind: string }[] }>(
      await activity(get(`/${child}/activity`), params(child)),
    );
    expect(feed.items.map((row) => row.kind)).toEqual(
      expect.arrayContaining(["created", "subtask_added"]),
    );
  });

  it("validates the form and its references", async () => {
    const ctx = await setup();
    const contractorElsewhere = await addContractor(
      ctx.company.workspaceId,
      ctx.owner.userId,
    );
    const cases: [Record<string, unknown>, string][] = [
      [{ name: " " }, "TASK_NAME_REQUIRED"],
      [
        { startDate: "2026-10-10", dueDate: "2026-10-01" },
        "TASK_DUE_BEFORE_START",
      ],
      [{ totalWorkQty: "10" }, "TASK_UNIT_REQUIRED"],
      [{ contractorId: contractorElsewhere }, "CONTRACTOR_NOT_ON_PROJECT"],
      [{ assigneeIds: [randomUUID()] }, "ASSIGNEE_NOT_ON_PROJECT"],
      [{ tagIds: [randomUUID()] }, "TAG_NOT_FOUND"],
      [{ totalWorkQty: "5", totalWorkUnitId: randomUUID() }, "UNIT_NOT_FOUND"],
    ];
    for (const [patch, code] of cases) {
      const response = await create(
        post("", { projectId: ctx.projectId, name: "Plaster", ...patch }),
      );
      expect(response.status, code).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(response)).toBe(code);
    }
  });

  it("captures baseline v1 from the dates, keeps it frozen, and re-baselines with a reason", async () => {
    const ctx = await setup();
    const id = await add(ctx, { name: "Brickwork" });
    expect((await detail(id)).baselineVersion).toBe(0);
    const before = await detail(id);
    const edited = await update(
      post(`/${id}/update`, {
        name: "Brickwork",
        startDate: "2026-09-01",
        dueDate: "2026-09-10",
        expectedUpdatedAt: before.updatedAt,
      }),
      params(id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const v1 = await json<Detail>(edited);
    expect(v1).toMatchObject({
      baselineStart: "2026-09-01",
      baselineEnd: "2026-09-10",
      baselineDuration: 10,
      baselineVersion: 1,
    });
    // Moving the planned dates leaves the baseline.
    const moved = await json<Detail>(
      await update(
        post(`/${id}/update`, {
          name: "Brickwork",
          startDate: "2026-09-05",
          dueDate: "2026-09-20",
          expectedUpdatedAt: v1.updatedAt,
        }),
        params(id),
      ),
    );
    expect(moved.baselineEnd).toBe("2026-09-10");
    // Stale edit.
    const stale = await update(
      post(`/${id}/update`, {
        name: "Brickwork",
        expectedUpdatedAt: v1.updatedAt,
      }),
      params(id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("TASK_CHANGED");
    const noReason = await rebaseline(
      post(`/${id}/rebaseline`, { reason: " " }),
      params(id),
    );
    expect(await codeOf(noReason)).toBe("REBASELINE_REASON_REQUIRED");
    const v2 = await json<Detail>(
      await rebaseline(
        post(`/${id}/rebaseline`, { reason: "Client moved the slab pour" }),
        params(id),
      ),
    );
    expect(v2).toMatchObject({
      baselineStart: "2026-09-05",
      baselineEnd: "2026-09-20",
      baselineVersion: 2,
    });
    expect(v2.baselines.map((b) => [b.version, b.reason])).toEqual([
      [2, "Client moved the slab pour"],
      [1, null],
    ]);
  });

  it("takes quantity increments, earns value, completes and reopens", async () => {
    const ctx = await setup();
    const id = await add(ctx, {
      name: "Excavation",
      startDate: addDays(TODAY, -10),
      dueDate: addDays(TODAY, 10),
      totalWorkQty: "200",
      totalWorkUnitId: ctx.unitId,
      totalPrice: 1_000_000,
    });
    const first = await progress(id, {
      progressDate: addDays(TODAY, -2),
      workQty: "50",
      remark: "Pit 1",
    });
    expect(first.status).toBe(StatusCodes.CREATED);
    let task = await detail(id);
    expect(task).toMatchObject({
      kind: "quantity",
      completedWorkQty: "50",
      progressPct: 25,
      status: "in_progress",
      completedPrice: 250_000,
      totalPrice: 1_000_000,
      actualStart: addDays(TODAY, -2),
      actualEnd: null,
    });
    // A percentage on a quantity task, a future date.
    expect(
      await codeOf(
        await progress(id, { progressDate: TODAY, progressPct: 40 }),
      ),
    ).toBe("PROGRESS_WORK_QTY_REQUIRED");
    expect(
      await codeOf(
        await progress(id, { progressDate: addDays(TODAY, 1), workQty: "1" }),
      ),
    ).toBe("PROGRESS_DATE_IN_FUTURE");
    // Mark As Completed records the remaining 150.
    const done = await complete(post(`/${id}/complete`, {}), params(id));
    expect(done.status).toBe(StatusCodes.CREATED);
    task = await detail(id);
    expect(task).toMatchObject({
      completedWorkQty: "200",
      progressPct: 100,
      status: "completed",
      actualEnd: TODAY,
      completedPrice: 1_000_000,
    });
    expect(
      await codeOf(await complete(post(`/${id}/complete`, {}), params(id))),
    ).toBe("TASK_ALREADY_COMPLETED");
    // Deleting the completing update reopens it.
    const updates = await json<{ items: Progress[] }>(
      await progressList(get(`/${id}/progress`), params(id)),
    );
    expect(updates.items.map((u) => u.workQty)).toEqual(["150", "50"]);
    const last = updates.items[0];
    if (last == null) throw new Error("an update");
    const removed = await removeProgress(
      post(`/progress/${last.id}/delete`, {}),
      progressParams(last.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    task = await detail(id);
    expect(task).toMatchObject({
      progressPct: 25,
      status: "in_progress",
      actualEnd: null,
    });
    const feed = await json<{ items: { kind: string }[] }>(
      await activity(get(`/${id}/activity`), params(id)),
    );
    expect(feed.items.map((row) => row.kind)).toEqual(
      expect.arrayContaining([
        "created",
        "progress_recorded",
        "completed",
        "reopened",
        "progress_deleted",
      ]),
    );
    // Overrun: more than the total stays at 100 %.
    await progress(id, { progressDate: TODAY, workQty: "300" });
    task = await detail(id);
    expect(task).toMatchObject({
      completedWorkQty: "350",
      progressPct: 100,
      status: "completed",
    });
  });

  it("takes percentages, refuses switching kind once there is progress, and edits updates", async () => {
    const ctx = await setup();
    const id = await add(ctx, { name: "Waterproofing" });
    const created = await progress(id, {
      progressDate: TODAY,
      progressPct: 40,
    });
    const progressId = (await json<{ id: string }>(created)).id;
    expect((await detail(id)).progressPct).toBe(40);
    const task = await detail(id);
    const switched = await update(
      post(`/${id}/update`, {
        name: "Waterproofing",
        totalWorkQty: "10",
        totalWorkUnitId: ctx.unitId,
        expectedUpdatedAt: task.updatedAt,
      }),
      params(id),
    );
    expect(switched.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(switched)).toBe("TASK_HAS_PROGRESS");
    const [row] = (
      await json<{ items: Progress[] }>(
        await progressList(get(`/${id}/progress`), params(id)),
      )
    ).items;
    if (row == null) throw new Error("an update");
    const edited = await editProgress(
      post(`/progress/${progressId}/update`, {
        progressDate: TODAY,
        progressPct: 100,
        expectedUpdatedAt: row.updatedAt,
      }),
      progressParams(progressId),
    );
    expect(edited.status).toBe(StatusCodes.NO_CONTENT);
    expect(await detail(id)).toMatchObject({
      progressPct: 100,
      status: "completed",
      actualEnd: TODAY,
    });
    // A lower percentage reopens it.
    await progress(id, { progressDate: TODAY, progressPct: 70 });
    expect(await detail(id)).toMatchObject({
      progressPct: 70,
      status: "in_progress",
      actualEnd: null,
    });
  });

  it("rolls up summary tasks by price, else by duration, and refuses progress on them", async () => {
    const ctx = await setup();
    const root = await add(ctx, { name: "Block B" });
    const a = await add(ctx, {
      name: "Footings",
      parentId: root,
      startDate: "2026-09-01",
      dueDate: "2026-09-09",
      totalPrice: 300_000,
    });
    const b = await add(ctx, {
      name: "Plinth beam",
      parentId: root,
      startDate: "2026-09-10",
      dueDate: "2026-09-10",
      totalPrice: 100_000,
    });
    await progress(a, { progressDate: TODAY, progressPct: 100 });
    let summary = await detail(root);
    expect(summary).toMatchObject({
      isSummary: true,
      weighting: "price",
      progressPct: 75,
      totalPrice: 400_000,
      completedPrice: 300_000,
      startDate: "2026-09-01",
      dueDate: "2026-09-10",
      baselineStart: "2026-09-01",
      baselineEnd: "2026-09-10",
      actualStart: TODAY,
      actualEnd: null,
    });
    expect(
      await codeOf(
        await progress(root, { progressDate: TODAY, progressPct: 5 }),
      ),
    ).toBe("TASK_IS_SUMMARY");
    // An unpriced sub-task switches the roll-up to duration (9 + 1 + 1 days).
    await add(ctx, { name: "Backfill", parentId: root });
    summary = await detail(root);
    expect(summary.weighting).toBe("duration");
    expect(summary.progressPct).toBe(81.82);
    // A leaf with progress cannot get sub-tasks.
    const refused = await create(
      post("", { projectId: ctx.projectId, name: "Nope", parentId: a }),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("TASK_HAS_PROGRESS");
    expect((await detail(b)).actions.addSubTask).toBe(true);
  });

  it("derives Delayed from the Due Date and filters by status", async () => {
    const ctx = await setup();
    await add(ctx, { name: "Late", dueDate: addDays(TODAY, -1) });
    const started = await add(ctx, {
      name: "Started",
      dueDate: addDays(TODAY, 5),
    });
    await progress(started, { progressDate: TODAY, progressPct: 10 });
    await add(ctx, { name: "Fresh" });
    const names = async (query: string) =>
      (await page(ctx, query)).items.map((t) => t.name);
    expect(await names("status=delayed")).toEqual(["Late"]);
    expect(await names("status=in_progress")).toEqual(["Started"]);
    expect(await names("status=not_started")).toEqual(["Fresh"]);
    expect(await names("search=T-2")).toEqual(["Started"]);
    expect(await names("search=fre")).toEqual(["Fresh"]);
  });

  it("filters any level and brings the ancestors along as context", async () => {
    const ctx = await setup();
    const contractorId = await addContractor(
      ctx.company.workspaceId,
      ctx.owner.userId,
      [ctx.projectId],
    );
    const root = await add(ctx, { name: "Tower" });
    await add(ctx, { name: "Shuttering", parentId: root, contractorId });
    await add(ctx, { name: "Steel", parentId: root });
    const result = await page(ctx, `contractorId=${contractorId}`);
    expect(result.items.map((t) => [t.name, t.matched])).toEqual([
      ["Tower", false],
      ["Shuttering", true],
    ]);
    expect(result.total).toBe(1);
  });

  it("pages top-level tasks with their sub-tasks", async () => {
    const ctx = await setup();
    const first = await add(ctx, { name: "One" });
    await add(ctx, { name: "One-a", parentId: first });
    await add(ctx, { name: "Two" });
    await add(ctx, { name: "Three" });
    const one = await page(ctx, "limit=2");
    expect(one.items.map((t) => t.name)).toEqual(["One", "One-a", "Two"]);
    expect(one.nextCursor).not.toBeNull();
    const two = await page(ctx, `limit=2&after=${one.nextCursor ?? ""}`);
    expect(two.items.map((t) => t.name)).toEqual(["Three"]);
    expect(two.nextCursor).toBeNull();
    const back = await page(ctx, `limit=2&before=${two.prevCursor ?? ""}`);
    expect(back.items.map((t) => t.name)).toEqual(["One", "One-a", "Two"]);
  });

  it("copies a task and its sub-tasks right below it, without progress", async () => {
    const ctx = await setup();
    const a = await add(ctx, { name: "A" });
    const a1 = await add(ctx, {
      name: "A1",
      parentId: a,
      startDate: "2026-09-01",
      dueDate: "2026-09-05",
    });
    await progress(a1, { progressDate: TODAY, progressPct: 50 });
    await add(ctx, { name: "B" });
    const copied = await copy(post(`/${a}/copy`, {}), params(a));
    expect(copied.status).toBe(StatusCodes.CREATED);
    const copyId = (await json<{ id: string }>(copied)).id;
    const tree = await page(ctx);
    expect(tree.items.map((t) => [t.name, t.depth])).toEqual([
      ["A", 1],
      ["A1", 2],
      ["A", 1],
      ["A1", 2],
      ["B", 1],
    ]);
    const copy1 = await detail(copyId);
    expect(copy1.taskNo).toBe(4);
    const child = copy1.children[0];
    expect(child).toMatchObject({
      taskNo: 5,
      progressPct: 0,
      actualStart: null,
      baselineVersion: 1,
      baselineStart: "2026-09-01",
    });
  });

  it("scopes without View all and masks prices without Financial", async () => {
    const ctx = await setup();
    const reader = await member(ctx, ["read", "create", "update"]);
    const root = await add(ctx, { name: "Owner's root", totalPrice: 5000 });
    const mine = await add(ctx, {
      name: "Assigned to member",
      parentId: root,
      assigneeIds: [reader.memberId],
      totalPrice: 7000,
    });
    await add(ctx, { name: "Not theirs" });
    actAs(reader.session);
    const seen = await page(ctx);
    expect(
      seen.items.map((t) => [t.name, t.contextOnly, t.totalPrice]),
    ).toEqual([
      ["Owner's root", true, null],
      ["Assigned to member", false, null],
    ]);
    expect(seen.items[0]?.actions.edit).toBe(false);
    expect(seen.total).toBe(1);
    const hidden = await getOne(get(`/${root}`), params(root));
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    const visible = await detail(mine);
    expect(visible.completedPrice).toBeNull();
    // Their own task shows; a price they send is ignored.
    const own = await add(ctx, { name: "Own task", totalPrice: 999 });
    actAs(ctx.owner);
    expect((await detail(own)).totalPrice).toBeNull();
    const all = await member(ctx, ["read", "view_all", "financial"]);
    actAs(all.session);
    expect((await page(ctx)).total).toBe(4);
    expect((await detail(mine)).totalPrice).toBe(7000);
    // Off the Project: 403.
    const outsider = await member(ctx, ["read", "view_all"], false);
    actAs(outsider.session);
    const refused = await list(get(`?projectId=${ctx.projectId}`));
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("lets the author or Task update change an update, nobody else", async () => {
    const ctx = await setup();
    const author = await member(ctx, ["read", "update", "view_all"]);
    const other = await member(ctx, ["read", "view_all"]);
    const id = await add(ctx, { name: "Plastering" });
    actAs(author.session);
    const created = await progress(id, {
      progressDate: TODAY,
      progressPct: 30,
    });
    const progressId = (await json<{ id: string }>(created)).id;
    actAs(other.session);
    const refused = await removeProgress(
      post(`/progress/${progressId}/delete`, {}),
      progressParams(progressId),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const items = (
      await json<{ items: Progress[] }>(
        await progressList(get(`/${id}/progress`), params(id)),
      )
    ).items;
    expect(items[0]?.actions).toEqual({ edit: false, delete: false });
    actAs(author.session);
    const deleted = await removeProgress(
      post(`/progress/${progressId}/delete`, {}),
      progressParams(progressId),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("bulk-deletes all or none, sub-tasks included, refusing tasks a worksheet names", async () => {
    const ctx = await setup();
    const a = await add(ctx, { name: "A" });
    const a1 = await add(ctx, { name: "A1", parentId: a });
    const b = await add(ctx, { name: "B" });
    const c = await add(ctx, { name: "C" });
    const sheet = await sharedAddWorksheetRow(
      ctx.company.workspaceId,
      ctx.owner.userId,
      ctx.projectId,
    );
    await prisma.constructionSiteWorkWorksheet.update({
      where: { id: sheet.id },
      data: { taskId: a1 },
    });
    const refused = await bulkDelete(
      post("/bulk-delete", { projectId: ctx.projectId, ids: [a, b] }),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    const body = await json<ErrorBody>(refused);
    expect(body.code).toBe("TASK_IN_USE");
    expect(body.details).toMatchObject({
      worksheetCount: 1,
      tasks: [{ id: a1, worksheetCount: 1 }],
    });
    expect((await page(ctx)).total).toBe(4);
    const missing = await bulkDelete(
      post("/bulk-delete", { projectId: ctx.projectId, ids: [randomUUID()] }),
    );
    expect(missing.status).toBe(StatusCodes.NOT_FOUND);
    // Unlink and delete.
    await prisma.constructionSiteWorkWorksheet.update({
      where: { id: sheet.id },
      data: { deletedAt: new Date() },
    });
    const done = await bulkDelete(
      post("/bulk-delete", { projectId: ctx.projectId, ids: [a, b] }),
    );
    expect(done.status).toBe(StatusCodes.OK);
    expect(await json<{ deleted: number }>(done)).toEqual({ deleted: 3 });
    expect((await page(ctx)).items.map((t) => t.name)).toEqual(["C"]);
    const one = await removeOne(post(`/${c}/delete`, {}), params(c));
    expect(await json<{ deleted: number }>(one)).toEqual({ deleted: 1 });
    // Without Delete.
    const reader = await member(ctx, ["read", "view_all"]);
    actAs(reader.session);
    const forbidden = await bulkDelete(
      post("/bulk-delete", { projectId: ctx.projectId, ids: [a] }),
    );
    expect(forbidden.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("serves the Gantt rows and the form options", async () => {
    const ctx = await setup();
    const tag = await trackingMaster(
      "tag",
      ctx.company.workspaceId,
      ctx.owner.userId,
      {
        name: "Critical",
      },
    );
    const root = await add(ctx, { name: "Root", tagIds: [tag] });
    await add(ctx, {
      name: "Leaf",
      parentId: root,
      startDate: "2026-09-01",
      dueDate: "2026-09-03",
    });
    const chart = await json<{ items: Task[]; today: string }>(
      await gantt(get(`/gantt?projectId=${ctx.projectId}`)),
    );
    expect(chart.today).toBe(TODAY);
    expect(chart.items.map((t) => t.name)).toEqual(["Root", "Leaf"]);
    expect((await page(ctx, `tagId=${tag}`)).items.map((t) => t.name)).toEqual([
      "Root",
    ]);
    const options = await json<{
      members: { isOwner: boolean }[];
      tags: { name: string }[];
      units: { name: string }[];
    }>(await formOptions(get(`/form-options?projectId=${ctx.projectId}`)));
    expect(options.members.some((m) => m.isOwner)).toBe(true);
    expect(options.tags.map((t) => t.name)).toContain("Critical");
    expect(options.units.map((u) => u.name.toLowerCase())).toContain("cum");
  });

  it("posts photos with an update and removes them with it", async () => {
    const ctx = await setup();
    const id = await add(ctx, { name: "Tiling" });
    const photo = await uploadTrackingFile("", "task", id, "tiles.webp", WEBP);
    const created = await progress(id, {
      progressDate: TODAY,
      progressPct: 20,
      fileIds: [photo.id],
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const progressId = (await json<{ id: string }>(created)).id;
    const listed = await json<{
      items: (Progress & { photos: { id: string; entryId: string }[] })[];
    }>(await progressList(get(`/${id}/progress`), params(id)));
    expect(listed.items[0]?.photos).toMatchObject([
      { id: photo.id, entryId: progressId },
    ]);
    // A photo goes with one update only.
    const again = await progress(id, {
      progressDate: TODAY,
      progressPct: 30,
      fileIds: [photo.id],
    });
    expect(await codeOf(again)).toBe("DOCUMENT_FILE_NOT_FOUND");
    await removeProgress(
      post(`/progress/${progressId}/delete`, {}),
      progressParams(progressId),
    );
    const file =
      await prisma.constructionTrackingDocumentFile.findUniqueOrThrow({
        where: { id: photo.id },
      });
    expect(file.deletedAt).not.toBeNull();
  });

  it("keeps a committed delete when the Gallery cannot be told", async () => {
    const ctx = await setup();
    const id = await add(ctx, { name: "Tiling" });
    const photo = await uploadTrackingFile("", "task", id, "tiles.webp", WEBP);
    expect(
      (
        await progress(id, {
          progressDate: TODAY,
          progressPct: 20,
          fileIds: [photo.id],
        })
      ).status,
    ).toBe(StatusCodes.CREATED);
    const gallery = failGalleryRemovals();
    try {
      const deleted = await removeOne(post(`/${id}/delete`, {}), params(id));
      expect(deleted.status).toBe(StatusCodes.OK);
      expect(await json<{ deleted: number }>(deleted)).toEqual({ deleted: 1 });
      expect(gallery.logged).toHaveBeenCalledWith(
        "Could not update the Project Gallery",
        expect.any(Error),
      );
    } finally {
      gallery.restore();
    }
    expect((await getOne(get(`/${id}`), params(id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("is on /api/docs", async () => {
    const doc = await json<{ paths: Record<string, unknown> }>(getOpenApi());
    for (const path of [
      "/api/construction/tracking/tasks",
      "/api/construction/tracking/tasks/{id}",
      "/api/construction/tracking/tasks/{id}/progress",
      "/api/construction/tracking/tasks/bulk-delete",
      "/api/construction/tracking/tasks/gantt",
      "/api/construction/tracking/tasks/progress/{progressId}/update",
    ])
      expect(doc.paths[path], path).toBeDefined();
  });
});
