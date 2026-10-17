import { prisma } from "@repo/construction-db";
import { after } from "next/server";

import {
  delayedQueueHandler,
  // Sales (CM-1004)
  followUpsDueQueueHandler,
  retentionQueueHandler,
} from "@/src/messaging/application/maintenance";
import { NotificationHandlers } from "@/src/messaging/application/notification-handlers";
import { NotificationListeners } from "@/src/messaging/application/listeners";
import { Notifier } from "@/src/messaging/application/notifier";
import type {
  BecameDelayed,
  DelayedWorkSource,
  // Sales (CM-1004)
  FollowUpsDue,
  FollowUpsDueSource,
  NotificationNames,
  PushSender,
  RecipientDirectory,
} from "@/src/messaging/application/ports";
import {
  PUSH_DRAIN_BUDGET_MS,
  pushQueueHandler,
} from "@/src/messaging/application/push-delivery";
import { prismaNotificationStore } from "@/src/messaging/infrastructure/prisma-notification-store";
import {
  prismaPreferenceStore,
  prismaPushSubscriptionStore,
} from "@/src/messaging/infrastructure/prisma-push-stores";
import {
  vapidKeysFromEnv,
  webPushSender,
} from "@/src/messaging/infrastructure/web-push-sender";
import { REPORT_TITLES } from "@/src/reporting/domain/report-job";
import {
  notificationRecipients,
  userIdsOfTeamMembers,
} from "@/src/shared-kernel/access/notification-recipients";
import {
  addDays,
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import {
  companyTimezone,
  companyToday,
} from "@/src/shared-kernel/company-today";
// Sales (CM-1004)
import { followUpDue } from "@/src/sales/domain/inquiry";
import { dueBounds, type DueBounds } from "@/src/sales/domain/sales-time";
import {
  InProcessEventDispatcher,
  type DomainEvent,
  type DomainEventListener,
  type EventDispatcher,
} from "@/src/shared-kernel/events";
import {
  createQueueDrain,
  prismaQueueStore,
  type QueueHandler,
} from "@/src/shared-kernel/queue";
import { issueStatus } from "@/src/tracking/domain/issue";
import { FULL_PCT, taskStatus } from "@/src/tracking/domain/task-progress";

/**
 * Messaging wired to Prisma, web push and the other contexts' names (ADR
 * CM-0021 §6). Modules hand their after-commit events to
 * `messagingEvents()`; the queue runs `push`, `messaging.retention` and
 * `messaging.delayed` (`queue.ts`).
 */

const notificationStore = prismaNotificationStore(prisma);
const subscriptionStore = prismaPushSubscriptionStore(prisma);
const preferenceStore = prismaPreferenceStore(prisma);

export const notificationRecipientDirectory: RecipientDirectory = {
  holders: (query) => notificationRecipients(prisma, query),
  usersOfMembers: (workspaceId, memberIds) =>
    userIdsOfTeamMembers(prisma, workspaceId, memberIds),
};

const REPORTS_PATH = "/api/construction/reporting/reports";

/** Names from the other contexts: plain reads (ADR-0030 cross-context). */
export const notificationNames: NotificationNames = {
  async project(workspaceId, projectId) {
    const row = await prisma.constructionProjectsProject.findFirst({
      where: { id: projectId, workspaceId },
      select: { name: true },
    });
    return row?.name ?? null;
  },
  async task(workspaceId, taskId) {
    const row = await prisma.constructionTrackingTask.findFirst({
      where: { id: taskId, workspaceId },
      select: { name: true },
    });
    return row?.name ?? null;
  },
  async material(workspaceId, materialId) {
    const row = await prisma.constructionMastersMaterial.findFirst({
      where: { id: materialId, workspaceId },
      select: { name: true },
    });
    return row?.name ?? null;
  },
  async location(workspaceId, location) {
    if (location.kind === "project")
      return notificationNames.project(workspaceId, location.id);
    const row = await prisma.constructionProcurementStore.findFirst({
      where: { id: location.id, workspaceId },
      select: { name: true },
    });
    return row?.name ?? null;
  },
  reportTitle(kind) {
    return (REPORT_TITLES as Partial<Record<string, string>>)[kind] ?? "report";
  },
  async reportDownloads(workspaceId, reportJobId) {
    const job = await prisma.constructionReportingReportJob.findFirst({
      where: { id: reportJobId, workspaceId },
      select: { pdfKey: true, xlsxKey: true },
    });
    const links: { label: string; href: string }[] = [];
    if (job?.pdfKey != null)
      links.push({
        label: "PDF",
        href: `${REPORTS_PATH}/${reportJobId}/download?format=pdf`,
      });
    if (job?.xlsxKey != null)
      links.push({
        label: "Excel",
        href: `${REPORTS_PATH}/${reportJobId}/download?format=xlsx`,
      });
    return links;
  },
};

/** Web push with the VAPID keys from the environment, read per call. */
export function pushSenderFromEnv(): PushSender {
  return webPushSender(vapidKeysFromEnv());
}

/** The `push` queue handler; tests pass a fake sender. */
export function createPushQueueHandler(
  sender: PushSender = pushSenderFromEnv(),
): QueueHandler {
  return pushQueueHandler({
    store: notificationStore,
    subscriptions: subscriptionStore,
    preferences: preferenceStore,
    sender,
  });
}

/**
 * Sends new push jobs right after the response, in this invocation, with
 * a short budget that still fits a push job's limit. Outside a request (HTTP tests) nothing runs: the daily
 * drain, or the test itself, drains them.
 */
function kickPush(ids: readonly string[]): Promise<void> {
  try {
    after(async () => {
      try {
        await createQueueDrain({
          store: prismaQueueStore(prisma),
          handlers: [createPushQueueHandler()],
        }).drain({ budgetMs: PUSH_DRAIN_BUDGET_MS, ids });
      } catch (error) {
        console.error("Push drain failed", error);
      }
    });
  } catch {
    // Not in a request.
  }
  return Promise.resolve();
}

export function createNotifier(): Notifier {
  return new Notifier({ store: notificationStore, kick: kickPush });
}

export function createNotificationHandlers(): NotificationHandlers {
  return new NotificationHandlers({
    store: notificationStore,
    preferences: preferenceStore,
    subscriptions: subscriptionStore,
  });
}

export function createNotificationListeners(): NotificationListeners {
  return new NotificationListeners({
    notifier: createNotifier(),
    recipients: notificationRecipientDirectory,
    names: notificationNames,
  });
}

/** Never lets a notification failure fail the command that raised it. */
const safeListener: DomainEventListener = {
  async handle(event: DomainEvent) {
    try {
      await createNotificationListeners().handle(event);
    } catch (error) {
      console.error(`Notifications for ${event.type} failed`, error);
    }
  },
};

/**
 * The dispatcher a module's application service hands its after-commit
 * events to, so messaging's listeners turn them into notifications (ADR
 * CM-0021 §6). A listener failure is logged and never fails the command.
 * `extra` listeners run first (e.g. finance's payables).
 */
export function messagingEvents(
  extra: readonly DomainEventListener[] = [],
): EventDispatcher {
  return new InProcessEventDispatcher([...extra, safeListener]);
}

// ---------------------------------------------------------------------------
// Daily jobs
// ---------------------------------------------------------------------------

/** `messaging.retention`: 90 days for notifications, a year for deliveries. */
export function createMessagingRetentionHandler(
  clock?: () => Date,
): QueueHandler {
  return retentionQueueHandler({ store: notificationStore, clock });
}

/**
 * Tracking's tasks and issues whose due date was yesterday in their
 * Company's today, read across contexts with tracking's own status rules
 * (a leaf task under 100 %, an open issue).
 */
export const trackingDelayedWork: DelayedWorkSource = {
  async becameDelayed(now) {
    // Every Company's today lies within a day of UTC's.
    const utc = now.toISOString().slice(0, 10);
    const window = {
      gte: calendarDateToDb(addDays(utc, -2)),
      lte: calendarDateToDb(utc),
    };
    const [tasks, issues] = await Promise.all([
      prisma.constructionTrackingTask.findMany({
        where: {
          deletedAt: null,
          dueDate: window,
          children: { none: { deletedAt: null } },
        },
        select: {
          id: true,
          workspaceId: true,
          projectId: true,
          taskNo: true,
          name: true,
          dueDate: true,
          progressPct: true,
          assignees: { select: { memberId: true } },
        },
      }),
      prisma.constructionTrackingIssue.findMany({
        where: {
          deletedAt: null,
          status: "open",
          dueDate: window,
          assigneeMemberId: { not: null },
        },
        select: {
          id: true,
          workspaceId: true,
          projectId: true,
          number: true,
          dueDate: true,
          assigneeMemberId: true,
        },
      }),
    ]);
    const todays = new Map<string, string>();
    const todayOf = async (workspaceId: string) => {
      const known = todays.get(workspaceId);
      if (known != null) return known;
      const today = await companyToday(prisma, workspaceId, now);
      todays.set(workspaceId, today);
      return today;
    };
    const found: BecameDelayed[] = [];
    for (const task of tasks) {
      if (task.dueDate == null) continue;
      const today = await todayOf(task.workspaceId);
      const dueDate = calendarDateFromDb(task.dueDate);
      const progressPct = Math.round(
        Number(task.progressPct) * (FULL_PCT / 100),
      );
      if (
        dueDate !== addDays(today, -1) ||
        taskStatus({ progressPct, dueDate }, today) !== "delayed"
      )
        continue;
      found.push({
        kind: "task",
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        id: task.id,
        name: `Task #${String(task.taskNo)} — ${task.name}`,
        dueDate,
        assigneeMemberIds: task.assignees.map((row) => row.memberId),
      });
    }
    for (const issue of issues) {
      if (issue.dueDate == null || issue.assigneeMemberId == null) continue;
      const today = await todayOf(issue.workspaceId);
      const dueDate = calendarDateFromDb(issue.dueDate);
      if (
        dueDate !== addDays(today, -1) ||
        issueStatus({ status: "open", dueDate }, today) !== "delayed"
      )
        continue;
      found.push({
        kind: "issue",
        workspaceId: issue.workspaceId,
        projectId: issue.projectId,
        id: issue.id,
        name: `Issue ${issue.number}`,
        dueDate,
        assigneeMemberIds: [issue.assigneeMemberId],
      });
    }
    return found;
  },
};

/** `messaging.delayed`: "became delayed" for tasks and issues. */
export function createMessagingDelayedHandler(
  clock?: () => Date,
): QueueHandler {
  return delayedQueueHandler({
    source: trackingDelayedWork,
    recipients: notificationRecipientDirectory,
    notifier: createNotifier(),
    clock,
  });
}

// ---------------------------------------------------------------------------
// Sales (CM-1004, ADR CM-0022 §10)
// ---------------------------------------------------------------------------

/**
 * Sales' open inquiries with an Assignee whose next follow-up is overdue
 * or due today on their Company's clock, counted per assignee and
 * Project, with sales' own Due rule (`followUpDue`).
 */
export const salesFollowUpsDue: FollowUpsDueSource = {
  async due(now) {
    // Anything due today anywhere lies before now plus a day and a half.
    const rows = await prisma.constructionSalesInquiry.findMany({
      where: {
        deletedAt: null,
        status: "open",
        assigneeMemberId: { not: null },
        nextFollowUpAt: { lt: new Date(now.getTime() + 36 * 3_600_000) },
      },
      select: {
        workspaceId: true,
        projectId: true,
        assigneeMemberId: true,
        nextFollowUpAt: true,
        nextFollowUpHasTime: true,
      },
    });
    const bounds = new Map<string, { date: string; due: DueBounds }>();
    const boundsOf = async (workspaceId: string) => {
      const known = bounds.get(workspaceId);
      if (known != null) return known;
      const [date, timeZone] = await Promise.all([
        companyToday(prisma, workspaceId, now),
        companyTimezone(prisma, workspaceId),
      ]);
      const made = { date, due: dueBounds(now, date, timeZone) };
      bounds.set(workspaceId, made);
      return made;
    };
    const found = new Map<string, FollowUpsDue>();
    for (const row of rows) {
      if (row.assigneeMemberId == null || row.nextFollowUpAt == null) continue;
      const { date, due } = await boundsOf(row.workspaceId);
      const state = followUpDue(
        "open",
        { at: row.nextFollowUpAt, hasTime: row.nextFollowUpHasTime },
        due,
      );
      if (state !== "overdue" && state !== "today") continue;
      const key = `${row.workspaceId}:${row.projectId}:${row.assigneeMemberId}`;
      const item = found.get(key) ?? {
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        assigneeMemberId: row.assigneeMemberId,
        date,
        overdue: 0,
        today: 0,
      };
      if (state === "overdue") item.overdue += 1;
      else item.today += 1;
      found.set(key, item);
    }
    return [...found.values()];
  },
};

/** `messaging.follow_ups_due`: the daily `inquiry.follow_ups_due` notices. */
export function createMessagingFollowUpsDueHandler(
  clock?: () => Date,
): QueueHandler {
  return followUpsDueQueueHandler({
    source: salesFollowUpsDue,
    recipients: notificationRecipientDirectory,
    notifier: createNotifier(),
    clock,
  });
}
