import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as raiseIssue } from "@/app/api/construction/tracking/issues/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import {
  createMessagingDelayedHandler,
  createMessagingRetentionHandler,
  createNotifier,
  createPushQueueHandler,
  messagingEvents,
} from "@/src/composition/messaging";
import { drainQueue } from "@/src/composition/queue";
import { NotificationListeners } from "@/src/messaging/application/listeners";
import type {
  PushSender,
  PushSendResult,
} from "@/src/messaging/application/ports";
import { deletePushSubscriptionsForSessions } from "@/src/messaging/infrastructure/prisma-push-stores";
import type { Flag } from "@/src/shared-kernel/access";
import {
  addDays,
  calendarDateToDb,
  todayIn,
} from "@/src/shared-kernel/calendar-date";
import type { DomainEvent } from "@/src/shared-kernel/events";
import type { QueueJob } from "@/src/shared-kernel/queue";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { sharedAssign } from "@/test/site-work";
import { trackingIssueRow, trackingTaskRow } from "@/test/tracking";

import { POST as deleteNotification } from "./notifications/[id]/delete/route";
import { POST as markRead } from "./notifications/[id]/read/route";
import { POST as readAll } from "./notifications/read-all/route";
import { GET as listNotifications } from "./notifications/route";
import { GET as unreadCount } from "./notifications/unread-count/route";
import { GET as getPreferences } from "./preferences/route";
import { POST as updatePreferences } from "./preferences/update/route";
import { GET as pushConfig } from "./push/config/route";
import { POST as unsubscribe } from "./push-subscriptions/delete/route";
import { POST as subscribe } from "./push-subscriptions/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/messaging";
const TODAY = todayIn("Asia/Kolkata");

type Notification = {
  id: string;
  type: string;
  menu: string | null;
  group: string;
  title: string;
  body: string | null;
  href: string | null;
  attachment: unknown;
  readAt: string | null;
};
type Page = { items: Notification[]; nextCursor: string | null };
type Unread = { count: number; latestReadyDownload: Notification | null };

const get = (path: string) => new Request(`${BASE}${path}`);
const post = (path: string, body?: unknown) =>
  new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Vitest" },
    body: body === undefined ? null : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function event<T extends Record<string, unknown>>(
  workspaceId: string,
  type: string,
  fields: T,
): DomainEvent & T {
  return { type, workspaceId, occurredAt: new Date(), ...fields };
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const projectId = await addProject(ws, company.ownerId, "Tower A");
  /** A member with these flags on one menu, on the Project unless told. */
  const member = async (
    menu: string,
    flags: Flag[],
    options: { onProject?: boolean } = {},
  ) => {
    const added = await addMember(ws, company.ownerId, { [menu]: flags });
    if (options.onProject !== false)
      await sharedAssign(added.memberId, projectId);
    return added;
  };
  const as = (userId: string, role: "owner" | "member" = "member") => {
    actAs({ userId, workspaceId: ws, role });
  };
  return { ws, owner: company.ownerId, projectId, member, as };
}

/** The notifications this user holds in the Company, straight from the table. */
function rowsOf(workspaceId: string, userId: string) {
  return prisma.constructionMessagingNotification.findMany({
    where: { workspaceId, recipientUserId: userId },
    orderBy: { createdAt: "asc" },
  });
}

async function listAs(): Promise<Page> {
  return json<Page>(await listNotifications(get("/notifications")));
}

/** A fake push service: answers per endpoint, `ok` otherwise. */
function fakeSender(results: Record<string, PushSendResult> = {}) {
  const sent: { endpoint: string; payload: unknown }[] = [];
  const sender: PushSender = {
    configured: true,
    send(subscription, payload) {
      sent.push({ endpoint: subscription.endpoint, payload });
      return Promise.resolve(results[subscription.endpoint] ?? { ok: true });
    },
  };
  return { sender, sent };
}

function job(type: string): QueueJob {
  return {
    id: randomUUID(),
    workspaceId: null,
    type,
    payload: null,
    attempts: 1,
    maxAttempts: 3,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Notifications HTTP (CM-904)", () => {
  it("is 401 without a Session and 403 without an Active Company", async () => {
    actAs({ userId: null, workspaceId: null });
    expect((await listNotifications(get("/notifications"))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    expect((await getPreferences(get("/preferences"))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    actAs({ userId: randomUUID(), workspaceId: null });
    const noCompany = await unreadCount(get("/notifications/unread-count"));
    expect(noCompany.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(noCompany)).toMatchObject({ code: "NO_ACTIVE_COMPANY" });
  });

  it("asks only approvers with Notification and Approve on the Project, never the actor", async () => {
    const ctx = await setup();
    const menu = "site_work.daily_worksheet";
    const approver = await ctx.member(menu, [
      "read",
      "approve",
      "notification",
    ]);
    const noN = await ctx.member(menu, ["read", "approve"]);
    const noApprove = await ctx.member(menu, ["read", "notification"]);
    const offProject = await ctx.member(
      menu,
      ["read", "approve", "notification"],
      { onProject: false },
    );
    const actor = await ctx.member(menu, ["read", "approve", "notification"]);
    await messagingEvents().dispatch([
      event(ctx.ws, "document.submitted", {
        documentType: "worksheet",
        documentId: randomUUID(),
        projectId: ctx.projectId,
        number: "WS/26-27/0001",
        submittedBy: actor.userId,
      }),
    ]);
    expect(await rowsOf(ctx.ws, approver.userId)).toEqual([
      expect.objectContaining({
        type: "approval.requested",
        menu,
        title: "Daily Worksheet WS/26-27/0001 is waiting for your approval",
        body: "Tower A",
      }),
    ]);
    // The Owner passes the matrix and the assignment check.
    expect(await rowsOf(ctx.ws, ctx.owner)).toHaveLength(1);
    for (const nobody of [noN, noApprove, offProject, actor])
      expect(await rowsOf(ctx.ws, nobody.userId)).toEqual([]);
  });

  it("tells a direct recipient only while they hold N and Read, through the real route", async () => {
    const ctx = await setup();
    const menu = "tracking.issues";
    const assignee = await ctx.member(menu, ["read", "notification"]);
    const withoutN = await ctx.member(menu, ["read"]);
    ctx.as(ctx.owner, "owner");
    const raised = await raiseIssue(
      new Request("http://localhost/api/construction/tracking/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: ctx.projectId,
          issueDate: TODAY,
          details: "Plaster cracks on the east wall",
          assigneeMemberId: assignee.memberId,
        }),
      }),
    );
    expect(raised.status).toBe(StatusCodes.CREATED);
    const issue = await json<{ id: string; number: string }>(raised);
    const [row] = await rowsOf(ctx.ws, assignee.userId);
    expect(row).toMatchObject({
      type: "issue.assigned",
      title: `Issue ${issue.number} was assigned to you`,
      link: { href: `/app/projects/${ctx.projectId}/issues/${issue.id}` },
    });
    // The Owner raised it: not told of their own action.
    expect(await rowsOf(ctx.ws, ctx.owner)).toEqual([]);
    // Assigned to someone without N: nothing.
    await messagingEvents().dispatch([
      event(ctx.ws, "IssueAssigned", {
        issueId: issue.id,
        projectId: ctx.projectId,
        number: issue.number,
        createdBy: ctx.owner,
        assigneeMemberId: withoutN.memberId,
        by: ctx.owner,
      }),
    ]);
    expect(await rowsOf(ctx.ws, withoutN.userId)).toEqual([]);
  });

  it("tells only the requester that their report is ready, and offers it for the toast", async () => {
    const ctx = await setup();
    const requester = await ctx.member("reporting.project_reports", ["read"]);
    const other = await ctx.member("reporting.project_reports", [
      "read",
      "notification",
    ]);
    const reportJobId = randomUUID();
    await messagingEvents().dispatch([
      event(ctx.ws, "ReportFinished", {
        reportJobId,
        kind: "task_report",
        projectId: ctx.projectId,
        requestedBy: requester.userId,
        status: "done",
        fileName: "Task Report",
        error: null,
      }),
    ]);
    expect(await rowsOf(ctx.ws, other.userId)).toEqual([]);
    expect(await rowsOf(ctx.ws, ctx.owner)).toEqual([]);
    ctx.as(requester.userId);
    const unread = await json<Unread>(
      await unreadCount(get("/notifications/unread-count")),
    );
    expect(unread).toMatchObject({
      count: 1,
      latestReadyDownload: {
        type: "report.ready",
        group: "downloads",
        title: "Your Task Report is ready",
        href: "/app/downloads",
        attachment: { kind: "report", id: reportJobId, downloads: [] },
      },
    });
    // Read, it no longer raises the toast.
    const id = unread.latestReadyDownload?.id ?? "";
    expect(
      (await markRead(post(`/notifications/${id}/read`), params(id))).status,
    ).toBe(StatusCodes.OK);
    expect(
      await json<Unread>(await unreadCount(get("/notifications/unread-count"))),
    ).toEqual({ count: 0, latestReadyDownload: null });
  });

  it("lists, reads, reads all and deletes only the member's own, in the Active Company", async () => {
    const ctx = await setup();
    const other = await newCompany();
    const me = await ctx.member("tracking.tasks", ["read", "notification"]);
    const colleague = await ctx.member("tracking.tasks", [
      "read",
      "notification",
    ]);
    const notifier = createNotifier();
    const draft = (n: number) => ({
      type: "task.assigned",
      menu: "tracking.tasks" as const,
      projectId: ctx.projectId,
      title: `You were assigned Task #${String(n)}`,
      body: null,
      href: null,
      sourceKey: `test:${randomUUID()}`,
    });
    for (let n = 1; n <= 3; n += 1)
      await notifier.notify(ctx.ws, [me.userId, colleague.userId], draft(n));
    // The same user in another Company: not in this list.
    await notifier.notify(other.workspaceId, [me.userId], draft(9));
    // The same source key again adds nothing.
    const repeat = draft(4);
    await notifier.notify(ctx.ws, [me.userId], repeat);
    await notifier.notify(ctx.ws, [me.userId], repeat);

    ctx.as(me.userId);
    const first = await json<Page>(
      await listNotifications(get("/notifications?limit=3")),
    );
    expect(first.items.map((item) => item.title)).toEqual([
      "You were assigned Task #4",
      "You were assigned Task #3",
      "You were assigned Task #2",
    ]);
    expect(first.nextCursor).not.toBeNull();
    const second = await json<Page>(
      await listNotifications(
        get(`/notifications?limit=3&cursor=${first.nextCursor ?? ""}`),
      ),
    );
    expect(second.items.map((item) => item.title)).toEqual([
      "You were assigned Task #1",
    ]);
    expect(second.nextCursor).toBeNull();

    // Someone else's notification is not found for me.
    const [theirs] = await rowsOf(ctx.ws, colleague.userId);
    const theirId = theirs?.id ?? "";
    expect(
      (await markRead(post(`/notifications/${theirId}/read`), params(theirId)))
        .status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await deleteNotification(
          post(`/notifications/${theirId}/delete`),
          params(theirId),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);

    const target = first.items[0]?.id ?? "";
    const read = await markRead(
      post(`/notifications/${target}/read`),
      params(target),
    );
    expect((await json<Notification>(read)).readAt).not.toBeNull();
    expect(await json(await readAll(post("/notifications/read-all")))).toEqual({
      updated: 3,
    });
    // My other Company's and my colleague's stay unread.
    expect(
      (await rowsOf(other.workspaceId, me.userId)).map((row) => row.readAt),
    ).toEqual([null]);
    expect(
      (await rowsOf(ctx.ws, colleague.userId)).every(
        (row) => row.readAt == null,
      ),
    ).toBe(true);

    const deleted = await deleteNotification(
      post(`/notifications/${target}/delete`),
      params(target),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect((await listAs()).items.map((item) => item.id)).not.toContain(target);
    // Deleting again is not found; its delivery log stays.
    expect(
      (
        await deleteNotification(
          post(`/notifications/${target}/delete`),
          params(target),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      await prisma.constructionMessagingNotificationDelivery.count({
        where: { notificationId: target, channel: "in_app", status: "sent" },
      }),
    ).toBe(1);
  });

  it("queues one push job per notification; the job sends, drops gone devices and skips muted groups", async () => {
    const ctx = await setup();
    const me = await ctx.member("procurement.purchase_requests", [
      "read",
      "approve",
      "notification",
    ]);
    ctx.as(me.userId);
    const endpoint = (name: string) =>
      `https://fcm.googleapis.com/fcm/send/${name}-${randomUUID()}`;
    const live = endpoint("live");
    const gone = endpoint("gone");
    for (const url of [live, gone]) {
      const response = await subscribe(
        post("/push-subscriptions", {
          endpoint: url,
          keys: { p256dh: "BNcR-key", auth: "auth-secret" },
        }),
      );
      expect(response.status).toBe(StatusCodes.CREATED);
    }
    const ids = await createNotifier().notify(ctx.ws, [me.userId], {
      type: "approval.requested",
      menu: "procurement.purchase_requests",
      projectId: ctx.projectId,
      title: "Purchase Request PR-0001 is waiting for your approval",
      body: "Tower A",
      href: "/app/somewhere",
      sourceKey: `test:${randomUUID()}`,
    });
    const notificationId = ids[0] ?? "";
    const jobs = await prisma.constructionOrganizationQueueJob.findMany({
      where: { type: "push", payload: { equals: { notificationId } } },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("queued");

    const { sender, sent } = fakeSender({
      [gone]: { ok: false, gone: true, error: "410: Gone" },
    });
    await drainQueue({
      ids: jobs.map((row) => row.id),
      handlers: [createPushQueueHandler(sender)],
    });
    expect(sent.map((item) => item.endpoint).sort()).toEqual(
      [gone, live].sort(),
    );
    expect(sent[0]?.payload).toEqual({
      title: "Purchase Request PR-0001 is waiting for your approval",
      body: "Tower A",
      href: "/app/somewhere",
      tag: notificationId,
    });
    const deliveries =
      await prisma.constructionMessagingNotificationDelivery.findMany({
        where: { notificationId, channel: "web_push" },
      });
    expect(deliveries.map((row) => row.status).sort()).toEqual([
      "failed",
      "sent",
    ]);
    expect(
      await prisma.constructionMessagingPushSubscription.findMany({
        where: { userId: me.userId },
        select: { endpoint: true, sessionId: true, userAgent: true },
      }),
    ).toEqual([
      {
        endpoint: live,
        sessionId: `session_${me.userId}`,
        userAgent: "Vitest",
      },
    ]);

    // Muted: the next one is skipped and logged.
    await updatePreferences(
      post("/preferences/update", { mutedGroups: ["materials"] }),
    );
    const [mutedId] = await createNotifier().notify(ctx.ws, [me.userId], {
      type: "approval.requested",
      menu: "procurement.purchase_requests",
      projectId: ctx.projectId,
      title: "Purchase Request PR-0002 is waiting for your approval",
      body: null,
      href: null,
      sourceKey: `test:${randomUUID()}`,
    });
    const muted = fakeSender();
    const mutedJobs = await prisma.constructionOrganizationQueueJob.findMany({
      where: { type: "push", payload: { equals: { notificationId: mutedId } } },
    });
    await drainQueue({
      ids: mutedJobs.map((row) => row.id),
      handlers: [createPushQueueHandler(muted.sender)],
    });
    expect(muted.sent).toEqual([]);
    expect(
      await prisma.constructionMessagingNotificationDelivery.findMany({
        where: { notificationId: mutedId, channel: "web_push" },
        select: { status: true, error: true },
      }),
    ).toEqual([{ status: "skipped", error: "Push is muted for this group." }]);
  });

  it("skips push without VAPID keys, and serves the public key when set", async () => {
    const ctx = await setup();
    const me = await ctx.member("tracking.tasks", ["read", "notification"]);
    ctx.as(me.userId);
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    expect(await json(await pushConfig(get("/push/config")))).toEqual({
      publicKey: null,
    });
    const [id] = await createNotifier().notify(ctx.ws, [me.userId], {
      type: "task.assigned",
      menu: "tracking.tasks",
      projectId: null,
      title: "You were assigned Task #1",
      body: null,
      href: null,
      sourceKey: `test:${randomUUID()}`,
    });
    const jobs = await prisma.constructionOrganizationQueueJob.findMany({
      where: { type: "push", payload: { equals: { notificationId: id } } },
    });
    await drainQueue({
      ids: jobs.map((row) => row.id),
      handlers: [createPushQueueHandler()],
    });
    expect(
      await prisma.constructionMessagingNotificationDelivery.findMany({
        where: { notificationId: id, channel: "web_push" },
        select: { status: true, error: true },
      }),
    ).toEqual([
      { status: "skipped", error: "Push is not set up on this server." },
    ]);
    vi.stubEnv("VAPID_PUBLIC_KEY", "BPublicKey");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
    vi.stubEnv("VAPID_SUBJECT", "mailto:support@example.test");
    expect(await json(await pushConfig(get("/push/config")))).toEqual({
      publicKey: "BPublicKey",
    });
    vi.unstubAllEnvs();
  });

  it("turns a device off, and drops a signed-out session's subscriptions", async () => {
    const ctx = await setup();
    const me = await ctx.member("tracking.tasks", ["read"]);
    ctx.as(me.userId);
    const url = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await subscribe(
      post("/push-subscriptions", {
        endpoint: url,
        keys: { p256dh: "k", auth: "a" },
      }),
    );
    const invalid = await subscribe(
      post("/push-subscriptions", { endpoint: "not a url", keys: {} }),
    );
    expect(invalid.status).toBe(StatusCodes.BAD_REQUEST);
    // Only a browser push service over HTTPS: never an address a user typed.
    for (const endpoint of [
      "https://169.254.169.254/latest/meta-data",
      "http://fcm.googleapis.com/fcm/send/plain-http",
    ]) {
      const refused = await subscribe(
        post("/push-subscriptions", {
          endpoint,
          keys: { p256dh: "k", auth: "a" },
        }),
      );
      expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    }
    expect(
      (await unsubscribe(post("/push-subscriptions/delete", { endpoint: url })))
        .status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      await prisma.constructionMessagingPushSubscription.count({
        where: { endpoint: url },
      }),
    ).toBe(0);

    await subscribe(
      post("/push-subscriptions", {
        endpoint: url,
        keys: { p256dh: "k", auth: "a" },
      }),
    );
    expect(
      await deletePushSubscriptionsForSessions([`session_${me.userId}`]),
    ).toBe(1);
    expect(
      await prisma.constructionMessagingPushSubscription.count({
        where: { userId: me.userId },
      }),
    ).toBe(0);
  });

  it("keeps a push switch per menu group", async () => {
    const ctx = await setup();
    const me = await ctx.member("tracking.tasks", ["read"]);
    ctx.as(me.userId);
    const initial = await json<{ groups: { key: string; muted: boolean }[] }>(
      await getPreferences(get("/preferences")),
    );
    expect(initial.groups.map((group) => group.key)).toEqual([
      "project_management",
      "payment_accounting",
      "contracts",
      "materials",
      "master_records",
      "central_store",
      "hrms",
      "others",
      "downloads",
    ]);
    expect(initial.groups.every((group) => !group.muted)).toBe(true);
    const updated = await json<{ groups: { key: string; muted: boolean }[] }>(
      await updatePreferences(
        post("/preferences/update", { mutedGroups: ["hrms", "downloads"] }),
      ),
    );
    expect(
      updated.groups.filter((group) => group.muted).map((group) => group.key),
    ).toEqual(["hrms", "downloads"]);
    const unknown = await updatePreferences(
      post("/preferences/update", { mutedGroups: ["chat"] }),
    );
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(unknown)).toMatchObject({
      code: "UNKNOWN_NOTIFICATION_GROUP",
    });
  });

  it("never fails the command when notifying fails", async () => {
    vi.spyOn(NotificationListeners.prototype, "handle").mockRejectedValue(
      new Error("The database is down"),
    );
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      messagingEvents().dispatch([
        event("ws", "TaskAssigned", {
          taskId: "t",
          projectId: "p",
          taskNo: 1,
          memberIds: [],
          by: "u",
        }),
      ]),
    ).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      "Notifications for TaskAssigned failed",
      expect.any(Error),
    );
  });

  it("deletes notifications after 90 days and deliveries after a year", async () => {
    const ctx = await setup();
    const me = await ctx.member("tracking.tasks", ["read"]);
    const now = new Date();
    const daysAgo = (days: number) =>
      new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const make = async (createdAt: Date) => {
      const id = randomUUID();
      await prisma.constructionMessagingNotification.create({
        data: {
          id,
          workspaceId: ctx.ws,
          recipientUserId: me.userId,
          type: "task.assigned",
          title: "Old",
          createdAt,
        },
      });
      return id;
    };
    const old = await make(daysAgo(91));
    const recent = await make(daysAgo(89));
    const delivery = (createdAt: Date, notificationId: string | null) =>
      prisma.constructionMessagingNotificationDelivery.create({
        data: {
          id: randomUUID(),
          notificationId,
          workspaceId: ctx.ws,
          recipientUserId: me.userId,
          channel: "in_app",
          status: "sent",
          createdAt,
        },
      });
    const oldDelivery = await delivery(daysAgo(366), null);
    const keptDelivery = await delivery(daysAgo(91), old);
    await createMessagingRetentionHandler(() => now).run(
      job("messaging.retention"),
      new AbortController().signal,
    );
    expect((await rowsOf(ctx.ws, me.userId)).map((row) => row.id)).toEqual([
      recent,
    ]);
    const deliveries =
      await prisma.constructionMessagingNotificationDelivery.findMany({
        where: { id: { in: [oldDelivery.id, keptDelivery.id] } },
      });
    // The notification's delete keeps its delivery row, unlinked.
    expect(deliveries).toEqual([
      expect.objectContaining({ id: keptDelivery.id, notificationId: null }),
    ]);
  });

  it("tells assignees once that a task or issue became delayed", async () => {
    const ctx = await setup();
    const assignee = await addMember(ctx.ws, ctx.owner, {
      "tracking.tasks": ["read", "notification"],
      "tracking.issues": ["read", "notification"],
    });
    await sharedAssign(assignee.memberId, ctx.projectId);
    const yesterday = addDays(TODAY, -1);
    const taskId = await trackingTaskRow(ctx.ws, ctx.projectId, ctx.owner, {
      name: "Shuttering",
    });
    await prisma.constructionTrackingTask.update({
      where: { id: taskId },
      data: {
        dueDate: calendarDateToDb(yesterday),
        assignees: { create: [{ memberId: assignee.memberId }] },
      },
    });
    // Due today: not delayed yet.
    const onTime = await trackingTaskRow(ctx.ws, ctx.projectId, ctx.owner);
    await prisma.constructionTrackingTask.update({
      where: { id: onTime },
      data: {
        dueDate: calendarDateToDb(TODAY),
        assignees: { create: [{ memberId: assignee.memberId }] },
      },
    });
    const issue = await trackingIssueRow(ctx.ws, ctx.projectId, ctx.owner, {
      assigneeMemberId: assignee.memberId,
      issueDate: addDays(TODAY, -3),
      dueDate: yesterday,
    });
    const handler = createMessagingDelayedHandler();
    for (let run = 0; run < 2; run += 1)
      await handler.run(job("messaging.delayed"), new AbortController().signal);
    const rows = await rowsOf(ctx.ws, assignee.userId);
    expect(
      rows
        .map((row) => [row.type, row.title])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["issue.delayed", `Issue ${issue.number} is delayed`],
      [
        "task.delayed",
        expect.stringMatching(/^Task #\d+ — Shuttering is delayed$/),
      ],
    ]);
  });

  it("is on /api/docs", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, Record<string, unknown>>;
    };
    for (const path of [
      "/api/construction/messaging/notifications",
      "/api/construction/messaging/notifications/unread-count",
      "/api/construction/messaging/notifications/{id}/read",
      "/api/construction/messaging/notifications/read-all",
      "/api/construction/messaging/notifications/{id}/delete",
      "/api/construction/messaging/push-subscriptions",
      "/api/construction/messaging/push-subscriptions/delete",
      "/api/construction/messaging/preferences",
      "/api/construction/messaging/preferences/update",
      "/api/construction/messaging/push/config",
    ])
      expect(document.paths[path]).toBeDefined();
  });
});
