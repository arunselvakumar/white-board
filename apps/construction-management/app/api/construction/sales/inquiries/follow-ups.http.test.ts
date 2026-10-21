import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createMessagingFollowUpsDueHandler } from "@/src/composition/messaging";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import type { QueueJob } from "@/src/shared-kernel/queue";
import { actAs, addMember, newCompany } from "@/test/companies";
import { salesLists, salesProject } from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import { GET as activity } from "./[id]/activity/route";
import { POST as removeFollowUp } from "./[id]/follow-ups/[followUpId]/delete/route";
import { POST as addFollowUp } from "./[id]/follow-ups/route";
import { GET as getOne } from "./[id]/route";
import { POST as deleteTask } from "./[id]/tasks/[taskId]/delete/route";
import { POST as doneTask } from "./[id]/tasks/[taskId]/done/route";
import { POST as reopenTask } from "./[id]/tasks/[taskId]/reopen/route";
import { POST as updateTask } from "./[id]/tasks/[taskId]/update/route";
import { GET as listTasks, POST as createTask } from "./[id]/tasks/route";
import { POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/sales/inquiries";
const TODAY = todayIn("Asia/Kolkata");
const MENU = "sales.inquiries";

type Named = { id: string; name: string | null } | null;
type Inquiry = {
  id: string;
  funnelStage: Named;
  nextFollowUp: { date: string; time: string | null } | null;
  due: string | null;
  updatedAt: string;
};
type Activity = {
  items: (
    | {
        kind: "follow_up";
        followUp: {
          id: string;
          activity: string;
          doneOn: { date: string; time: string };
          remarks: string | null;
          fromStage: Named;
          toStage: Named;
          nextFollowUp: { date: string; time: string | null } | null;
          by: { userId: string; name: string | null };
          canDelete: boolean;
        };
      }
    | { kind: "event"; event: { type: string } }
  )[];
};
type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  assignee: Named;
  status: string;
  doneAt: string | null;
  doneBy: { userId: string } | null;
  updatedAt: string;
};
type ErrorBody = { code: string; details?: Record<string, unknown> };

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(path: string, body: unknown = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** `HH:MM` some minutes ago in India (the Companies' zone). */
function minutesAgo(minutes: number): { date: string; time: string } {
  const at = new Date(Date.now() - minutes * 60_000);
  const local = new Date(at.getTime() + 330 * 60_000);
  return {
    date: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
  };
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await salesProject(ws, by);
  const lists = await salesLists(projectId);
  actAs(owner);
  const response = await create(
    post("", { projectId, name: "Lakshmi Narayanan" }),
  );
  const inquiry = await json<Inquiry>(response);
  return { ws, by, owner, projectId, lists, inquiry };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

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

function followUp(id: string, body: Record<string, unknown> = {}) {
  const done = minutesAgo(5);
  return addFollowUp(
    post(`/${id}/follow-ups`, {
      activity: "call",
      doneOnDate: done.date,
      doneOnTime: done.time,
      remarks: "Called; wants a site visit on Saturday",
      ...body,
    }),
    params(id),
  );
}

const timeline = async (id: string) =>
  json<Activity>(
    await activity(new Request(`${BASE}/${id}/activity`), params(id)),
  );

describe("Follow-ups (CM-1004)", () => {
  it("records a follow-up, moves the stage and sets the next follow-up", async () => {
    const ctx = await setup();
    const response = await followUp(ctx.inquiry.id, {
      toStageId: ctx.lists.stageId["Site Visit"],
      nextFollowUpDate: addDays(TODAY, 2),
      nextFollowUpTime: "11:00",
    });
    expect(response.status).toBe(StatusCodes.CREATED);
    const inquiry = await json<Inquiry>(response);
    expect(inquiry).toMatchObject({
      funnelStage: { name: "Site Visit" },
      nextFollowUp: { date: addDays(TODAY, 2), time: "11:00" },
      due: "upcoming",
    });
    const items = (await timeline(ctx.inquiry.id)).items;
    // By when each happened (the call was before the inquiry was keyed in);
    // the follow-up's own stage move is not listed twice.
    expect(items.map((item) => item.kind)).toEqual(["event", "follow_up"]);
    expect(items[1]).toMatchObject({
      kind: "follow_up",
      followUp: {
        activity: "call",
        remarks: "Called; wants a site visit on Saturday",
        fromStage: { name: "New" },
        toStage: { name: "Site Visit" },
        nextFollowUp: { date: addDays(TODAY, 2), time: "11:00" },
        by: { userId: ctx.by, name: "Arun Selva Kumar" },
        canDelete: true,
      },
    });
    const events = await prisma.constructionSalesInquiryEvent.findMany({
      where: { inquiryId: ctx.inquiry.id, type: "stage_moved" },
    });
    expect(events).toHaveLength(1);
    // A follow-up with no next follow-up clears it.
    const cleared = await json<Inquiry>(await followUp(ctx.inquiry.id));
    expect(cleared).toMatchObject({ nextFollowUp: null, due: "none" });
    expect(cleared.funnelStage?.name).toBe("Site Visit");
  });

  it("lets the newest follow-up decide the next step", async () => {
    const ctx = await setup();
    await followUp(ctx.inquiry.id, {
      toStageId: ctx.lists.stageId["Site Visit"],
      nextFollowUpDate: addDays(TODAY, 2),
      nextFollowUpTime: "11:00",
    });
    // A call from yesterday keyed in late, with no next follow-up and
    // another stage: it is recorded, the inquiry keeps the newer next step.
    const yesterday = minutesAgo(24 * 60);
    const late = await followUp(ctx.inquiry.id, {
      doneOnDate: yesterday.date,
      doneOnTime: yesterday.time,
      toStageId: ctx.lists.stageId["Negotiation"],
    });
    expect(late.status).toBe(StatusCodes.CREATED);
    expect(await json<Inquiry>(late)).toMatchObject({
      funnelStage: { name: "Site Visit" },
      nextFollowUp: { date: addDays(TODAY, 2), time: "11:00" },
      due: "upcoming",
    });
    const items = (await timeline(ctx.inquiry.id)).items;
    expect(items.filter((item) => item.kind === "follow_up")).toHaveLength(2);
    const events = await prisma.constructionSalesInquiryEvent.findMany({
      where: { inquiryId: ctx.inquiry.id, type: "stage_moved" },
    });
    expect(events).toHaveLength(1);
  });

  it("refuses a closed inquiry, a future Done on and a next follow-up before it", async () => {
    const ctx = await setup();
    const future = minutesAgo(-120);
    const ahead = await followUp(ctx.inquiry.id, {
      doneOnDate: future.date,
      doneOnTime: future.time,
    });
    expect(await json<ErrorBody>(ahead)).toMatchObject({
      code: "FOLLOW_UP_IN_FUTURE",
      details: { field: "doneOn" },
    });
    const before = await followUp(ctx.inquiry.id, {
      nextFollowUpDate: addDays(TODAY, -3),
    });
    expect(await json<ErrorBody>(before)).toMatchObject({
      code: "NEXT_FOLLOW_UP_BEFORE_DONE",
      details: { field: "nextFollowUp" },
    });
    // The same day without a time is fine.
    const done = minutesAgo(5);
    const sameDay = await followUp(ctx.inquiry.id, {
      nextFollowUpDate: done.date,
    });
    expect(sameDay.status).toBe(StatusCodes.CREATED);
    const otherProject = await salesProject(ctx.ws, ctx.by);
    const otherLists = await salesLists(otherProject);
    const wrongStage = await followUp(ctx.inquiry.id, {
      toStageId: otherLists.stageId["New"],
    });
    expect((await json<ErrorBody>(wrongStage)).code).toBe(
      "FUNNEL_STAGE_NOT_FOUND",
    );
    await prisma.constructionSalesInquiry.update({
      where: { id: ctx.inquiry.id },
      data: { status: "converted" },
    });
    const closed = await followUp(ctx.inquiry.id);
    expect(closed.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(closed)).code).toBe("INQUIRY_NOT_OPEN");
  });

  it("needs Update, follows View all, and keeps the back-dated window", async () => {
    const ctx = await setup();
    const reader = await member(ctx, ["read", "view_all"]);
    actAs(reader.actor);
    expect((await followUp(ctx.inquiry.id)).status).toBe(StatusCodes.FORBIDDEN);
    const seller = await member(ctx, ["read", "update"]);
    actAs(seller.actor);
    expect((await followUp(ctx.inquiry.id)).status).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await activity(
          new Request(`${BASE}/x/activity`),
          params(ctx.inquiry.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    await prisma.constructionSalesInquiry.update({
      where: { id: ctx.inquiry.id },
      data: { leadOwnerMemberId: seller.memberId },
    });
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: ctx.ws,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          inquiry_follow_up: {
            mode: "custom",
            create: { days: 1, overrideDesignationIds: [] },
            edit: { days: 1, overrideDesignationIds: [] },
          },
        },
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    const old = await followUp(ctx.inquiry.id, {
      doneOnDate: addDays(TODAY, -5),
      doneOnTime: "10:00",
    });
    expect(old.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(old)).code).toBe("BACKDATED_CREATE_BLOCKED");
    expect((await followUp(ctx.inquiry.id)).status).toBe(StatusCodes.CREATED);
    // Removing an old follow-up is an edit of it: the Owner may key one in,
    // a Team Member outside the window cannot remove it.
    actAs(ctx.owner);
    expect(
      (
        await followUp(ctx.inquiry.id, {
          doneOnDate: addDays(TODAY, -5),
          doneOnTime: "10:00",
        })
      ).status,
    ).toBe(StatusCodes.CREATED);
    const oldItem = (await timeline(ctx.inquiry.id)).items.find(
      (entry) =>
        entry.kind === "follow_up" &&
        entry.followUp.doneOn.date === addDays(TODAY, -5),
    );
    if (oldItem?.kind !== "follow_up") throw new Error("an old follow-up");
    const deleter = await member(ctx, ["read", "delete", "view_all"]);
    actAs(deleter.actor);
    const removeOld = await removeFollowUp(
      post(`/${ctx.inquiry.id}/follow-ups/${oldItem.followUp.id}/delete`),
      {
        params: Promise.resolve({
          id: ctx.inquiry.id,
          followUpId: oldItem.followUp.id,
        }),
      },
    );
    expect(removeOld.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(removeOld)).code).toBe(
      "BACKDATED_EDIT_BLOCKED",
    );
  });

  it("removes one entered by mistake (Inquiry Delete), leaving the next follow-up", async () => {
    const ctx = await setup();
    const saved = await json<Inquiry>(
      await followUp(ctx.inquiry.id, { nextFollowUpDate: addDays(TODAY, 1) }),
    );
    const item = (await timeline(ctx.inquiry.id)).items.find(
      (entry) => entry.kind === "follow_up",
    );
    if (item?.kind !== "follow_up") throw new Error("a follow-up");
    const updater = await member(ctx, ["read", "update", "view_all"]);
    actAs(updater.actor);
    const refused = await removeFollowUp(
      post(`/${ctx.inquiry.id}/follow-ups/${item.followUp.id}/delete`),
      {
        params: Promise.resolve({
          id: ctx.inquiry.id,
          followUpId: item.followUp.id,
        }),
      },
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    actAs(ctx.owner);
    const removed = await removeFollowUp(
      post(`/${ctx.inquiry.id}/follow-ups/${item.followUp.id}/delete`),
      {
        params: Promise.resolve({
          id: ctx.inquiry.id,
          followUpId: item.followUp.id,
        }),
      },
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await timeline(ctx.inquiry.id)).items.filter(
        (entry) => entry.kind === "follow_up",
      ),
    ).toEqual([]);
    const after = await json<Inquiry>(
      await getOne(
        new Request(`${BASE}/${ctx.inquiry.id}`),
        params(ctx.inquiry.id),
      ),
    );
    expect(after.nextFollowUp).toEqual(saved.nextFollowUp);
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: ctx.inquiry.id, action: "inquiry.follow_up_deleted" },
    });
    expect(audit).not.toBeNull();
  });
});

describe("Inquiry Tasks (CM-1004)", () => {
  const taskParams = (id: string, taskId: string) => ({
    params: Promise.resolve({ id, taskId }),
  });

  it("adds, edits, ticks and deletes tasks", async () => {
    const ctx = await setup();
    const seller = await member(ctx, ["read"]);
    const id = ctx.inquiry.id;
    const empty = await createTask(
      post(`/${id}/tasks`, { title: " " }),
      params(id),
    );
    expect((await json<ErrorBody>(empty)).code).toBe(
      "INQUIRY_TASK_TITLE_REQUIRED",
    );
    const offProject = await member(ctx, ["read"], false);
    const notOn = await createTask(
      post(`/${id}/tasks`, {
        title: "Send brochure",
        assigneeMemberId: offProject.memberId,
      }),
      params(id),
    );
    expect((await json<ErrorBody>(notOn)).code).toBe("ASSIGNEE_NOT_ON_PROJECT");
    const created = await createTask(
      post(`/${id}/tasks`, {
        title: "Send brochure",
        dueDate: addDays(TODAY, 1),
        assigneeMemberId: seller.memberId,
      }),
      params(id),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const task = await json<Task>(created);
    expect(task).toMatchObject({
      title: "Send brochure",
      dueDate: addDays(TODAY, 1),
      assignee: { id: seller.memberId, name: "Prabhu Saravanan" },
      status: "open",
    });
    await createTask(
      post(`/${id}/tasks`, { title: "Share price list" }),
      params(id),
    );
    const edited = await updateTask(
      post(`/${id}/tasks/${task.id}/update`, {
        title: "Send brochure and floor plan",
        dueDate: TODAY,
        assigneeMemberId: null,
        expectedUpdatedAt: task.updatedAt,
      }),
      taskParams(id, task.id),
    );
    const editedBody = await json<Task>(edited);
    expect(editedBody).toMatchObject({
      title: "Send brochure and floor plan",
      dueDate: TODAY,
      assignee: null,
    });
    const stale = await updateTask(
      post(`/${id}/tasks/${task.id}/update`, {
        title: "Again",
        expectedUpdatedAt: task.updatedAt,
      }),
      taskParams(id, task.id),
    );
    expect((await json<ErrorBody>(stale)).code).toBe("INQUIRY_TASK_CHANGED");
    const done = await json<Task>(
      await doneTask(
        post(`/${id}/tasks/${task.id}/done`),
        taskParams(id, task.id),
      ),
    );
    expect(done).toMatchObject({ status: "done", doneBy: { userId: ctx.by } });
    const list = await json<{ items: Task[]; canManage: boolean }>(
      await listTasks(new Request(`${BASE}/${id}/tasks`), params(id)),
    );
    // Open ones first, done ones last.
    expect(list.items.map((item) => item.title)).toEqual([
      "Share price list",
      "Send brochure and floor plan",
    ]);
    expect(list.canManage).toBe(true);
    const reopened = await json<Task>(
      await reopenTask(
        post(`/${id}/tasks/${task.id}/reopen`),
        taskParams(id, task.id),
      ),
    );
    expect(reopened).toMatchObject({
      status: "open",
      doneAt: null,
      doneBy: null,
    });
    const removed = await deleteTask(
      post(`/${id}/tasks/${task.id}/delete`),
      taskParams(id, task.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);

    const reader = await member(ctx, ["read", "view_all"]);
    actAs(reader.actor);
    const read = await json<{ items: Task[]; canManage: boolean }>(
      await listTasks(new Request(`${BASE}/${id}/tasks`), params(id)),
    );
    expect(read.items).toHaveLength(1);
    expect(read.canManage).toBe(false);
    const refused = await createTask(
      post(`/${id}/tasks`, { title: "Mine" }),
      params(id),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });
});

describe("inquiry.follow_ups_due (CM-1004)", () => {
  it("tells each assignee once a day how many follow-ups are due", async () => {
    const ctx = await setup();
    const seller = await member(ctx, ["read", "update", "notification"]);
    const quiet = await member(ctx, ["read", "update"]);
    const add = (name: string, memberId: string, date: string, time?: string) =>
      create(
        post("", {
          projectId: ctx.projectId,
          name,
          assigneeMemberId: memberId,
          nextFollowUpDate: date,
          nextFollowUpTime: time ?? null,
        }),
      );
    await add("Overdue one", seller.memberId, addDays(TODAY, -2));
    await add("Overdue two", seller.memberId, TODAY, "00:00");
    await add("Today", seller.memberId, TODAY);
    await add("Later", seller.memberId, addDays(TODAY, 3));
    await add("Not told", quiet.memberId, addDays(TODAY, -1));
    const handler = createMessagingFollowUpsDueHandler();
    const job: QueueJob = {
      id: newId(),
      type: "messaging.follow_ups_due",
      workspaceId: null,
      payload: null,
      attempts: 1,
      maxAttempts: 3,
    };
    await handler.run(job, new AbortController().signal);
    await handler.run(job, new AbortController().signal);
    const rows = await prisma.constructionMessagingNotification.findMany({
      where: { workspaceId: ctx.ws, type: "inquiry.follow_ups_due" },
    });
    expect(rows).toMatchObject([
      {
        recipientUserId: seller.actor.userId,
        title: "You have 3 follow-ups to do",
        body: "2 overdue, 1 due today.",
        link: {
          href: `/app/projects/${ctx.projectId}/inquiries/list?due=overdue`,
        },
      },
    ]);
  });

  it("is on /api/docs", async () => {
    const doc = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    for (const path of [
      "/api/construction/sales/inquiries/{id}/activity",
      "/api/construction/sales/inquiries/{id}/follow-ups",
      "/api/construction/sales/inquiries/{id}/follow-ups/{followUpId}/delete",
      "/api/construction/sales/inquiries/{id}/tasks",
      "/api/construction/sales/inquiries/{id}/tasks/{taskId}/done",
      "/api/construction/sales/documents/{type}/{id}/files",
    ])
      expect(doc.paths).toHaveProperty([path]);
  });
});
