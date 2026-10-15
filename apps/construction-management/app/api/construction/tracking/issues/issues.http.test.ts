import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import {
  sharedAssign,
  worksheetContractor,
  worksheetDepartment,
  worksheetLocation,
} from "@/test/site-work";
import { uploadTrackingFile } from "@/app/api/construction/tracking/documents/document-test-fixtures";
import { pngBytes } from "@/test/files";
import { trackingIssueRow, trackingMaster } from "@/test/tracking";

import { POST as remove } from "./[id]/delete/route";
import { POST as deleteUpdate } from "./[id]/progress/[updateId]/delete/route";
import { GET as progress, POST as postProgress } from "./[id]/progress/route";
import { POST as reopen } from "./[id]/reopen/route";
import { GET as getOne } from "./[id]/route";
import { POST as solve } from "./[id]/solve/route";
import { POST as update } from "./[id]/update/route";
import { POST as verify } from "./[id]/verify/route";
import { POST as bulkSolve } from "./bulk-solve/route";
import { POST as bulkVerify } from "./bulk-verify/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/tracking/issues";
const TODAY = todayIn("Asia/Kolkata");
const MENU = "tracking.issues";

type Named = { id: string; name: string | null } | null;
type Person = { userId: string; name: string | null } | null;

type Issue = {
  id: string;
  number: string;
  issueDate: string;
  details: string;
  priority: string | null;
  category: Named;
  department: Named;
  contractor: Named;
  assignee: Named;
  dueDate: string | null;
  siteLocation: unknown;
  status: string;
  storedStatus: string;
  solvedAt: string | null;
  solvedBy: Person;
  closedAt: string | null;
  closedBy: Person;
  sourceInspection: { id: string; number: string } | null;
  createdBy: Person;
  updatedAt: string;
  actions: Record<string, boolean>;
  history: {
    kind: string;
    reason: string | null;
    payload: unknown;
    by: Person;
  }[];
};

type Page = { items: Issue[]; total: number };
type ErrorBody = { code: string; details?: { field?: string } };
type Update = {
  id: string;
  body: string | null;
  canDelete: boolean;
  files: { id: string }[];
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

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
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by, "Tower A");
  const department = await worksheetDepartment(ws, by, { name: "Plastering" });
  const contractor = await worksheetContractor(ws, by, {
    name: "Velan Constructions",
    projectIds: [projectId],
  });
  const category = await trackingMaster("issue_category", ws, by, {
    name: "Workmanship",
  });
  const locationId = await worksheetLocation(ws, by, projectId, "Pump house");
  actAs(owner);
  return {
    company,
    ws,
    by,
    owner,
    projectId,
    department,
    contractor,
    category,
    locationId,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

/** A member with these flags on the Project, and their Team Member id. */
async function member(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.ws, ctx.by, { [MENU]: flags });
  if (onProject) await sharedAssign(added.memberId, ctx.projectId);
  return {
    memberId: added.memberId,
    actor: {
      userId: added.userId,
      workspaceId: ctx.ws,
      role: "member" as const,
    },
  };
}

function raise(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return create(
    post("", {
      projectId: ctx.projectId,
      issueDate: addDays(TODAY, -2),
      details: "Plaster cracks on the east wall",
      priority: "high",
      ...patch,
    }),
  );
}

async function raised(ctx: Ctx, patch: Record<string, unknown> = {}) {
  const response = await raise(ctx, patch);
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Issue>(response);
}

const edit = (issue: Issue, patch: Record<string, unknown> = {}) =>
  update(
    post(`/${issue.id}/update`, {
      issueDate: issue.issueDate,
      details: issue.details,
      priority: issue.priority,
      categoryId: issue.category?.id ?? null,
      departmentId: issue.department?.id ?? null,
      contractorId: issue.contractor?.id ?? null,
      assigneeMemberId: issue.assignee?.id ?? null,
      dueDate: issue.dueDate,
      expectedUpdatedAt: issue.updatedAt,
      ...patch,
    }),
    params(issue.id),
  );

const read = async (id: string) =>
  json<Issue>(await getOne(get(`/${id}`), params(id)));

async function numbers(ctx: Ctx, query = ""): Promise<string[]> {
  const page = await json<Page>(
    await list(get(`?projectId=${ctx.projectId}${query}`)),
  );
  return page.items.map((item) => item.number).sort();
}

describe("Issues & Snags (CM-803)", () => {
  it("raises, numbers and reads an issue with its names and history", async () => {
    const ctx = await setup();
    const assignee = await member(ctx, ["read"]);
    const first = await raised(ctx, {
      categoryId: ctx.category,
      departmentId: ctx.department,
      contractorId: ctx.contractor,
      assigneeMemberId: assignee.memberId,
      dueDate: addDays(TODAY, 3),
      siteLocation: { type: "location", locationId: ctx.locationId },
    });
    expect(first.number).toMatch(/^ISS\/\d{2}-\d{2}\/00001$/);
    expect(first).toMatchObject({
      status: "pending",
      storedStatus: "open",
      priority: "high",
      category: { id: ctx.category, name: "Workmanship" },
      department: { id: ctx.department, name: "Plastering" },
      contractor: { id: ctx.contractor, name: "Velan Constructions" },
      assignee: { id: assignee.memberId, name: "Prabhu Saravanan" },
      siteLocation: { type: "location", locationId: ctx.locationId },
      solvedAt: null,
      sourceInspection: null,
      createdBy: { userId: ctx.by, name: "Arun Selva Kumar" },
      actions: {
        edit: true,
        delete: true,
        solve: true,
        verify: false,
        reopen: false,
        postUpdate: true,
      },
    });
    expect(first.history.map((item) => item.kind)).toEqual(["created"]);

    // Save & Mark As Solved creates it solved, with Solved On / By.
    const second = await raised(ctx, { markSolved: true, priority: null });
    expect(second.number).toMatch(/\/00002$/);
    expect(second).toMatchObject({
      status: "solved",
      solvedBy: { userId: ctx.by },
      actions: { edit: false, solve: false, verify: true, reopen: true },
    });
    expect(second.solvedAt).not.toBeNull();
    expect(second.history.map((item) => item.kind)).toEqual([
      "created",
      "solved",
    ]);

    expect((await read(first.id)).id).toBe(first.id);
    const page = await json<Page>(
      await list(get(`?projectId=${ctx.projectId}`)),
    );
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.number)).toEqual([
      second.number,
      first.number,
    ]);

    const options = await json<{
      members: { id: string }[];
      issueCategories: { id: string; name: string }[];
      contractors: { id: string }[];
    }>(await formOptions(get(`/form-options?projectId=${ctx.projectId}`)));
    expect(options.members.map((item) => item.id)).toContain(assignee.memberId);
    expect(options.issueCategories.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Workmanship", "Quality", "Safety"]),
    );
    expect(options.contractors.map((item) => item.id)).toEqual([
      ctx.contractor,
    ]);
  });

  it("validates the form and its references", async () => {
    const ctx = await setup();
    const refuse = async (
      patch: Record<string, unknown>,
      code: string,
      field?: string,
    ) => {
      const response = await raise(ctx, patch);
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await json<ErrorBody>(response)).toMatchObject({
        code,
        ...(field == null ? {} : { details: { field } }),
      });
    };
    await refuse({ details: "  " }, "ISSUE_DETAILS_REQUIRED", "details");
    await refuse(
      { dueDate: addDays(TODAY, -3) },
      "ISSUE_DUE_BEFORE_ISSUE_DATE",
      "dueDate",
    );
    await refuse(
      { issueDate: addDays(TODAY, 1) },
      "ISSUE_DATE_IN_FUTURE",
      "issueDate",
    );
    const disabled = await trackingMaster("issue_category", ctx.ws, ctx.by, {
      disabled: true,
    });
    await refuse(
      { categoryId: disabled },
      "ISSUE_CATEGORY_DISABLED",
      "categoryId",
    );
    await refuse(
      { categoryId: newId() },
      "ISSUE_CATEGORY_NOT_FOUND",
      "categoryId",
    );
    const offProject = await member(ctx, ["read"], false);
    await refuse(
      { assigneeMemberId: offProject.memberId },
      "ASSIGNEE_NOT_ON_PROJECT",
      "assigneeMemberId",
    );
    const elsewhere = await worksheetContractor(ctx.ws, ctx.by);
    await refuse(
      { contractorId: elsewhere },
      "CONTRACTOR_NOT_ON_PROJECT",
      "contractorId",
    );
    const otherProject = await addProject(ctx.ws, ctx.by);
    const otherPlace = await worksheetLocation(ctx.ws, ctx.by, otherProject);
    const wrongPlace = await raise(ctx, {
      siteLocation: { type: "location", locationId: otherPlace },
    });
    expect(wrongPlace.status).toBe(StatusCodes.BAD_REQUEST);

    // An issue keeps a category disabled after it was picked.
    const issue = await raised(ctx, { categoryId: ctx.category });
    await prisma.constructionMastersIssueCategory.update({
      where: { id: ctx.category },
      data: { disabledAt: new Date() },
    });
    const kept = await edit(issue, { details: "Wider cracks" });
    expect(kept.status).toBe(StatusCodes.OK);
    expect(await json<Issue>(kept)).toMatchObject({
      details: "Wider cracks",
      category: { id: ctx.category },
    });
  });

  it("edits only an open issue and records what changed", async () => {
    const ctx = await setup();
    const assignee = await member(ctx, ["read"]);
    const issue = await raised(ctx);
    const edited = await json<Issue>(
      await edit(issue, {
        details: "Cracks above the lintel",
        assigneeMemberId: assignee.memberId,
        siteLocation: { type: "location", locationId: ctx.locationId },
      }),
    );
    expect(edited.history.map((item) => item.kind)).toEqual([
      "created",
      "edited",
      "assigned",
    ]);
    expect(edited.history[1]?.payload).toEqual({
      fields: ["details", "assigneeMemberId", "siteLocation"],
    });
    expect(edited.history[2]?.payload).toMatchObject({
      from: null,
      to: assignee.memberId,
      toName: "Prabhu Saravanan",
    });

    // Clearing the location writes a real NULL.
    const cleared = await json<Issue>(
      await edit(edited, { siteLocation: null }),
    );
    expect(cleared.siteLocation).toBeNull();
    const row = await prisma.constructionTrackingIssue.findUniqueOrThrow({
      where: { id: issue.id },
    });
    expect(row.siteLocation).toBeNull();

    const stale = await edit(issue, { details: "Stale" });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(stale)).code).toBe("ISSUE_CHANGED");

    await solve(post(`/${issue.id}/solve`, {}), params(issue.id));
    const solved = await read(issue.id);
    const refused = await edit(solved, { details: "Too late" });
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(refused)).code).toBe("ISSUE_NOT_OPEN");
  });

  it("derives Delayed from the Due Date and filters by it", async () => {
    const ctx = await setup();
    const late = await raised(ctx, {
      issueDate: addDays(TODAY, -5),
      dueDate: addDays(TODAY, -1),
    });
    const dueToday = await raised(ctx, { dueDate: TODAY });
    const undated = await raised(ctx, { priority: "low" });
    const solvedLate = await raised(ctx, {
      issueDate: addDays(TODAY, -5),
      dueDate: addDays(TODAY, -1),
      markSolved: true,
    });
    expect(late.status).toBe("delayed");
    expect(dueToday.status).toBe("pending");
    expect(undated.status).toBe("pending");
    expect(solvedLate.status).toBe("solved");

    expect(await numbers(ctx, "&status=delayed")).toEqual([late.number]);
    expect(await numbers(ctx, "&status=pending")).toEqual(
      [dueToday.number, undated.number].sort(),
    );
    expect(await numbers(ctx, "&status=pending,delayed")).toEqual(
      [late.number, dueToday.number, undated.number].sort(),
    );
    expect(await numbers(ctx, "&status=solved")).toEqual([solvedLate.number]);
    expect(await numbers(ctx, "&priority=low")).toEqual([undated.number]);
    expect(
      await numbers(
        ctx,
        `&from=${addDays(TODAY, -5)}&to=${addDays(TODAY, -3)}`,
      ),
    ).toEqual([late.number, solvedLate.number].sort());
    expect(await numbers(ctx, `&search=${late.number}`)).toEqual([late.number]);
    const bad = await list(get(`?projectId=${ctx.projectId}&status=late`));
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("filters by category, assignee, Department, Contractor and location", async () => {
    const ctx = await setup();
    const assignee = await member(ctx, ["read"]);
    const tagged = await raised(ctx, {
      categoryId: ctx.category,
      departmentId: ctx.department,
      contractorId: ctx.contractor,
      assigneeMemberId: assignee.memberId,
      siteLocation: { type: "location", locationId: ctx.locationId },
    });
    await raised(ctx);
    for (const query of [
      `&categoryId=${ctx.category}`,
      `&assigneeMemberId=${assignee.memberId}`,
      `&departmentId=${ctx.department}`,
      `&contractorId=${ctx.contractor}`,
      `&locationType=location`,
      `&locationType=location&placeId=${ctx.locationId}`,
    ])
      expect(await numbers(ctx, query)).toEqual([tagged.number]);
    expect(
      await numbers(ctx, `&locationType=location&placeId=${newId()}`),
    ).toEqual([]);
  });

  it("refuses a back-dated Issue Date beyond the policy", async () => {
    const ctx = await setup();
    const old = await raised(ctx, { issueDate: addDays(TODAY, -10) });
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: ctx.ws,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          issue: {
            mode: "custom",
            create: { days: 3, overrideDesignationIds: [] },
            edit: { days: 3, overrideDesignationIds: [] },
          },
        },
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    const engineer = await member(ctx, ["read", "create", "update"]);
    actAs(engineer.actor);
    const created = await raise(ctx, { issueDate: addDays(TODAY, -10) });
    expect(created.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(created)).code).toBe(
      "BACKDATED_CREATE_BLOCKED",
    );
    expect((await raise(ctx, { issueDate: addDays(TODAY, -2) })).status).toBe(
      StatusCodes.CREATED,
    );
    actAs(ctx.owner);
    const assigned = await json<Issue>(
      await edit(old, { assigneeMemberId: engineer.memberId }),
    );
    actAs(engineer.actor);
    const edited = await edit(assigned, { details: "Changed" });
    expect((await json<ErrorBody>(edited)).code).toBe("BACKDATED_EDIT_BLOCKED");
    // Marking as solved is not an entry on the Issue Date.
    const solved = await solve(post(`/${old.id}/solve`, {}), params(old.id));
    expect(solved.status).toBe(StatusCodes.OK);
  });

  it("checks the flag of each transition and keeps the history", async () => {
    const ctx = await setup();
    const issue = await raised(ctx);

    const updater = await member(ctx, ["read", "view_all", "update"]);
    const approver = await member(ctx, ["read", "view_all", "approve"]);
    const rejecter = await member(ctx, ["read", "view_all", "reject"]);

    actAs(approver.actor);
    const early = await verify(
      post(`/${issue.id}/verify`, {}),
      params(issue.id),
    );
    expect(early.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(early)).code).toBe("ISSUE_NOT_SOLVED");

    actAs(updater.actor);
    expect(
      (await verify(post(`/${issue.id}/verify`, {}), params(issue.id))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const solved = await json<Issue>(
      await solve(post(`/${issue.id}/solve`, {}), params(issue.id)),
    );
    expect(solved).toMatchObject({
      status: "solved",
      solvedBy: { userId: updater.actor.userId },
    });
    const again = await solve(post(`/${issue.id}/solve`, {}), params(issue.id));
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(again)).code).toBe("ISSUE_NOT_OPEN");

    actAs(approver.actor);
    const closed = await json<Issue>(
      await verify(post(`/${issue.id}/verify`, {}), params(issue.id)),
    );
    expect(closed).toMatchObject({
      status: "closed",
      solvedBy: { userId: updater.actor.userId },
      closedBy: { userId: approver.actor.userId },
      actions: { verify: false, reopen: false },
    });

    actAs(rejecter.actor);
    const noReason = await reopen(
      post(`/${issue.id}/reopen`, { reason: "  " }),
      params(issue.id),
    );
    expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await json<ErrorBody>(noReason)).code).toBe(
      "ISSUE_REOPEN_REASON_REQUIRED",
    );
    const reopened = await json<Issue>(
      await reopen(
        post(`/${issue.id}/reopen`, { reason: "Cracks came back" }),
        params(issue.id),
      ),
    );
    expect(reopened).toMatchObject({
      status: "pending",
      solvedAt: null,
      solvedBy: null,
      closedAt: null,
      closedBy: null,
    });
    expect(
      reopened.history.map((item) => [item.kind, item.reason, item.by?.userId]),
    ).toEqual([
      ["created", null, ctx.by],
      ["solved", null, updater.actor.userId],
      ["closed", null, approver.actor.userId],
      ["reopened", "Cracks came back", rejecter.actor.userId],
    ]);
    const openAgain = await reopen(
      post(`/${issue.id}/reopen`, { reason: "Again" }),
      params(issue.id),
    );
    expect(openAgain.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(openAgain)).code).toBe("ISSUE_NOT_RESOLVED");

    // Save & Mark As Solved needs Update as well as Create.
    const creator = await member(ctx, ["read", "create"]);
    actAs(creator.actor);
    expect((await raise(ctx, { markSolved: true })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await raise(ctx)).status).toBe(StatusCodes.CREATED);
  });

  it("shows a member without View all only their own and assigned issues", async () => {
    const ctx = await setup();
    const viewer = await member(ctx, ["read", "create", "update"]);
    const everyone = await member(ctx, ["read", "view_all"]);
    const others = await raised(ctx, { details: "Owner's issue" });
    const assigned = await raised(ctx, {
      details: "Assigned to the viewer",
      assigneeMemberId: viewer.memberId,
    });
    actAs(viewer.actor);
    const own = await raised(ctx, { details: "Raised by the viewer" });
    expect(await numbers(ctx)).toEqual([assigned.number, own.number].sort());
    const hidden = await getOne(get(`/${others.id}`), params(others.id));
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    const solveHidden = await solve(
      post(`/${others.id}/solve`, {}),
      params(others.id),
    );
    expect(solveHidden.status).toBe(StatusCodes.NOT_FOUND);
    const bulk = await json<{ done: number; skipped: number }>(
      await bulkSolve(
        post("/bulk-solve", {
          projectId: ctx.projectId,
          ids: [others.id, assigned.id],
        }),
      ),
    );
    expect(bulk).toEqual({ done: 1, skipped: 1 });
    expect((await read(assigned.id)).status).toBe("solved");

    actAs(everyone.actor);
    expect(await numbers(ctx)).toHaveLength(3);
    actAs(ctx.owner);
    expect((await read(others.id)).status).toBe("pending");
  });

  it("bulk solves and verifies the selected issues, skipping and counting the rest", async () => {
    const ctx = await setup();
    const open = await raised(ctx);
    const late = await raised(ctx, {
      issueDate: addDays(TODAY, -4),
      dueDate: addDays(TODAY, -1),
    });
    const solved = await raised(ctx, { markSolved: true });
    const closed = await raised(ctx, { markSolved: true });
    await verify(post(`/${closed.id}/verify`, {}), params(closed.id));
    const otherProject = await addProject(ctx.ws, ctx.by);
    const elsewhere = await json<Issue>(
      await create(
        post("", {
          projectId: otherProject,
          issueDate: TODAY,
          details: "On another Project",
        }),
      ),
    );
    const ids = [open.id, late.id, solved.id, closed.id, elsewhere.id];

    const solving = await json<{ done: number; skipped: number }>(
      await bulkSolve(post("/bulk-solve", { projectId: ctx.projectId, ids })),
    );
    expect(solving).toEqual({ done: 2, skipped: 3 });
    expect((await read(open.id)).status).toBe("solved");
    expect((await read(late.id)).status).toBe("solved");
    expect((await read(elsewhere.id)).status).toBe("pending");

    const verifying = await json<{ done: number; skipped: number }>(
      await bulkVerify(post("/bulk-verify", { projectId: ctx.projectId, ids })),
    );
    expect(verifying).toEqual({ done: 3, skipped: 2 });
    expect((await read(solved.id)).status).toBe("closed");

    const updater = await member(ctx, ["read", "update"]);
    actAs(updater.actor);
    const denied = await bulkVerify(
      post("/bulk-verify", { projectId: ctx.projectId, ids }),
    );
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("keeps a Progress thread: comment and images, delete own within 24 hours", async () => {
    const ctx = await setup();
    const issue = await raised(ctx);
    const empty = await postProgress(
      post(`/${issue.id}/progress`, { body: "  " }),
      params(issue.id),
    );
    expect(empty.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await json<ErrorBody>(empty)).code).toBe("ISSUE_UPDATE_EMPTY");

    const comment = await postProgress(
      post(`/${issue.id}/progress`, { body: "Mason called for tomorrow" }),
      params(issue.id),
    );
    expect(comment.status).toBe(StatusCodes.CREATED);
    const first = await json<Update>(comment);
    expect(first).toMatchObject({
      body: "Mason called for tomorrow",
      canDelete: true,
    });
    const photo = await uploadTrackingFile(
      "",
      "issue",
      issue.id,
      "crack.png",
      pngBytes(),
    );
    const photos = await json<Update>(
      await postProgress(
        post(`/${issue.id}/progress`, { fileIds: [photo.id] }),
        params(issue.id),
      ),
    );
    expect(photos.body).toBeNull();
    expect(photos.files.map((file) => file.id)).toEqual([photo.id]);
    // A file goes with one update only.
    const reused = await postProgress(
      post(`/${issue.id}/progress`, { body: "Again", fileIds: [photo.id] }),
      params(issue.id),
    );
    expect(reused.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await json<ErrorBody>(reused)).code).toBe(
      "DOCUMENT_FILE_NOT_FOUND",
    );

    const helper = await member(ctx, ["read", "view_all", "update"]);
    actAs(helper.actor);
    const fixed = await uploadTrackingFile(
      "",
      "issue",
      issue.id,
      "fixed.png",
      pngBytes(),
    );
    const theirs = await json<Update>(
      await postProgress(
        post(`/${issue.id}/progress`, {
          body: "Fixed the joint",
          fileIds: [fixed.id],
        }),
        params(issue.id),
      ),
    );
    const thread = await json<{ items: Update[] }>(
      await progress(get(`/${issue.id}/progress`), params(issue.id)),
    );
    expect(
      thread.items.map((item) => [
        item.body,
        item.files.length,
        item.canDelete,
      ]),
    ).toEqual([
      ["Mason called for tomorrow", 0, false],
      [null, 1, false],
      ["Fixed the joint", 1, true],
    ]);
    const gallery = () =>
      prisma.constructionProjectsMediaItem.findMany({
        where: { source: "issue", sourceId: issue.id, deletedAt: null },
      });
    expect(await gallery()).toHaveLength(2);
    const notYours = await deleteUpdate(
      post(`/${issue.id}/progress/${first.id}/delete`, {}),
      { params: Promise.resolve({ id: issue.id, updateId: first.id }) },
    );
    expect(notYours.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(notYours)).code).toBe(
      "ISSUE_UPDATE_NOT_YOURS",
    );
    const own = await deleteUpdate(
      post(`/${issue.id}/progress/${theirs.id}/delete`, {}),
      { params: Promise.resolve({ id: issue.id, updateId: theirs.id }) },
    );
    expect(own.status).toBe(StatusCodes.NO_CONTENT);
    // Its image leaves the Gallery with it.
    expect((await gallery()).map((item) => item.fileName)).toEqual([
      "crack.png",
    ]);

    actAs(ctx.owner);
    await prisma.constructionTrackingIssueUpdate.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const tooOld = await deleteUpdate(
      post(`/${issue.id}/progress/${first.id}/delete`, {}),
      { params: Promise.resolve({ id: issue.id, updateId: first.id }) },
    );
    expect(tooOld.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(tooOld)).code).toBe("ISSUE_UPDATE_TOO_OLD");
    const left = await json<{ items: Update[] }>(
      await progress(get(`/${issue.id}/progress`), params(issue.id)),
    );
    expect(left.items).toHaveLength(2);

    // Read alone cannot post.
    const reader = await member(ctx, ["read", "view_all"]);
    actAs(reader.actor);
    const denied = await postProgress(
      post(`/${issue.id}/progress`, { body: "Hello" }),
      params(issue.id),
    );
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("follows the Permission Matrix on the Project and deletes", async () => {
    const ctx = await setup();
    const issue = await raised(ctx);
    const reader = await member(ctx, ["read", "view_all"]);
    actAs(reader.actor);
    const denied = await raise(ctx);
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    // Access comes before validation: no details for a caller without it.
    const invalid = await raise(ctx, { priority: "urgent" });
    expect(invalid.status).toBe(StatusCodes.FORBIDDEN);
    expect((await read(issue.id)).actions).toEqual({
      edit: false,
      delete: false,
      solve: false,
      verify: false,
      reopen: false,
      postUpdate: false,
    });

    const offProject = await member(ctx, ["read", "view_all"], false);
    actAs(offProject.actor);
    expect((await getOne(get(`/${issue.id}`), params(issue.id))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await list(get(`?projectId=${ctx.projectId}`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const other = await newCompany();
    actAs({ userId: other.ownerId, workspaceId: other.workspaceId });
    expect((await getOne(get(`/${issue.id}`), params(issue.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await list(get(`?projectId=${ctx.projectId}`))).status).toBe(
      StatusCodes.NOT_FOUND,
    );

    actAs(ctx.owner);
    await uploadTrackingFile("", "issue", issue.id, "site.png", pngBytes());
    const deleted = await remove(
      post(`/${issue.id}/delete`, { expectedUpdatedAt: issue.updatedAt }),
      params(issue.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect(
      await prisma.constructionProjectsMediaItem.count({
        where: { source: "issue", sourceId: issue.id, deletedAt: null },
      }),
    ).toBe(0);
    expect((await getOne(get(`/${issue.id}`), params(issue.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(await numbers(ctx)).toEqual([]);
  });

  it("names the inspection a snag was raised from", async () => {
    const ctx = await setup();
    const inspectionId = newId();
    await prisma.constructionTrackingInspection.create({
      data: {
        id: inspectionId,
        workspaceId: ctx.ws,
        projectId: ctx.projectId,
        number: "IR/26-27/00007",
        inspectionDate: new Date(`${TODAY}T00:00:00Z`),
        workDescription: "Column reinforcement",
        status: "rejected",
        decidedAt: new Date(),
        decidedBy: ctx.by,
        rejectionReason: "Cover blocks missing",
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    const snag = await trackingIssueRow(ctx.ws, ctx.projectId, ctx.by, {
      sourceInspectionId: inspectionId,
    });
    expect((await read(snag.id)).sourceInspection).toEqual({
      id: inspectionId,
      number: "IR/26-27/00007",
    });
  });

  it("is on /api/docs", async () => {
    const document = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/tracking/issues",
      "/api/construction/tracking/issues/form-options",
      "/api/construction/tracking/issues/bulk-solve",
      "/api/construction/tracking/issues/bulk-verify",
      "/api/construction/tracking/issues/{id}",
      "/api/construction/tracking/issues/{id}/update",
      "/api/construction/tracking/issues/{id}/solve",
      "/api/construction/tracking/issues/{id}/verify",
      "/api/construction/tracking/issues/{id}/reopen",
      "/api/construction/tracking/issues/{id}/delete",
      "/api/construction/tracking/issues/{id}/progress",
      "/api/construction/tracking/issues/{id}/progress/{updateId}/delete",
    ])
      expect(document.paths[path], path).toBeDefined();
    expect(
      document.components.schemas["ConstructionTrackingIssueDetailResponse"],
    ).toBeDefined();
  });
});
