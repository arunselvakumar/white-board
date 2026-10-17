import type { QueueHandler } from "@/src/shared-kernel/queue";

import { retentionCutoffs } from "../domain/notification";
import { dateLabel, LINKS } from "../domain/notification-kinds";
import type { Notifier } from "./notifier";
import type {
  DelayedWorkSource,
  // Sales (CM-1004)
  FollowUpsDueSource,
  NotificationStore,
  RecipientDirectory,
} from "./ports";

/** Daily: notifications after 90 days, deliveries after a year (§3). */
export const RETENTION_QUEUE_TYPE = "messaging.retention";

/** Daily: "became delayed" for tasks and issues (ADR CM-0021 §6). */
export const DELAYED_QUEUE_TYPE = "messaging.delayed";

export function retentionQueueHandler(deps: {
  store: NotificationStore;
  clock?: () => Date;
}): QueueHandler {
  return {
    type: RETENTION_QUEUE_TYPE,
    timeLimitMs: 120_000,
    async run() {
      const now = (deps.clock ?? (() => new Date()))();
      await deps.store.purge(retentionCutoffs(now));
    },
  };
}

export type DelayedDeps = {
  source: DelayedWorkSource;
  recipients: RecipientDirectory;
  notifier: Notifier;
  clock?: () => Date;
};

/**
 * Tells each assignee (holding the menu's Notification and Read flags, on
 * the Project) that a task or issue became delayed: its due date was
 * yesterday in its Company's today. The source key is per record and due
 * date, so the job running twice in a day — or a later run seeing the
 * same date — adds nothing.
 */
export async function raiseBecameDelayed(deps: DelayedDeps): Promise<number> {
  const now = (deps.clock ?? (() => new Date()))();
  let written = 0;
  for (const item of await deps.source.becameDelayed(now)) {
    const menu = item.kind === "task" ? "tracking.tasks" : "tracking.issues";
    const assignees = await deps.recipients.usersOfMembers(
      item.workspaceId,
      item.assigneeMemberIds,
    );
    if (assignees.length === 0) continue;
    const recipients = await deps.recipients.holders({
      workspaceId: item.workspaceId,
      menu,
      flag: "read",
      projectId: item.projectId,
      among: assignees,
    });
    const ids = await deps.notifier.notify(item.workspaceId, recipients, {
      type: item.kind === "task" ? "task.delayed" : "issue.delayed",
      menu,
      projectId: item.projectId,
      title: `${item.name} is delayed`,
      body: `It was due on ${dateLabel(item.dueDate)}.`,
      href:
        item.kind === "task"
          ? LINKS.task(item.projectId, item.id)
          : LINKS.issue(item.projectId, item.id),
      sourceKey: `${item.kind}.delayed:${item.id}:${item.dueDate}`,
    });
    written += ids.length;
  }
  return written;
}

export function delayedQueueHandler(deps: DelayedDeps): QueueHandler {
  return {
    type: DELAYED_QUEUE_TYPE,
    timeLimitMs: 240_000,
    async run() {
      await raiseBecameDelayed(deps);
    },
  };
}

// ---------------------------------------------------------------------------
// Sales (CM-1004, ADR CM-0022 §10)
// ---------------------------------------------------------------------------

/** Daily: each assignee's follow-ups due today and overdue. */
export const FOLLOW_UPS_DUE_QUEUE_TYPE = "messaging.follow_ups_due";

export type FollowUpsDueDeps = {
  source: FollowUpsDueSource;
  recipients: RecipientDirectory;
  notifier: Notifier;
  clock?: () => Date;
};

function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/**
 * `inquiry.follow_ups_due`: one notice per assignee and Project (holding
 * Inquiry Notification and Read on it) with how many of their open
 * inquiries are overdue or due today, linking the Overdue list (or
 * Today's when none is overdue). The source key is per Project, member
 * and date, so a second run that day adds nothing.
 */
export async function raiseFollowUpsDue(
  deps: FollowUpsDueDeps,
): Promise<number> {
  const now = (deps.clock ?? (() => new Date()))();
  let written = 0;
  for (const item of await deps.source.due(now)) {
    if (item.overdue + item.today === 0) continue;
    const users = await deps.recipients.usersOfMembers(item.workspaceId, [
      item.assigneeMemberId,
    ]);
    if (users.length === 0) continue;
    const recipients = await deps.recipients.holders({
      workspaceId: item.workspaceId,
      menu: "sales.inquiries",
      flag: "read",
      projectId: item.projectId,
      among: users,
    });
    const parts = [
      item.overdue > 0 ? `${String(item.overdue)} overdue` : null,
      item.today > 0 ? `${String(item.today)} due today` : null,
    ].filter((part): part is string => part != null);
    const ids = await deps.notifier.notify(item.workspaceId, recipients, {
      type: "inquiry.follow_ups_due",
      menu: "sales.inquiries",
      projectId: item.projectId,
      title: `You have ${count(item.overdue + item.today, "follow-up", "follow-ups")} to do`,
      body: `${parts.join(", ")}.`,
      href: LINKS.inquiriesDue(
        item.projectId,
        item.overdue > 0 ? "overdue" : "today",
      ),
      sourceKey: `inquiry.follow_ups_due:${item.projectId}:${item.assigneeMemberId}:${item.date}`,
    });
    written += ids.length;
  }
  return written;
}

export function followUpsDueQueueHandler(deps: FollowUpsDueDeps): QueueHandler {
  return {
    type: FOLLOW_UPS_DUE_QUEUE_TYPE,
    timeLimitMs: 240_000,
    async run() {
      await raiseFollowUpsDue(deps);
    },
  };
}
