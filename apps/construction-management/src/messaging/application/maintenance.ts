import type { QueueHandler } from "@/src/shared-kernel/queue";

import { retentionCutoffs } from "../domain/notification";
import { dateLabel, LINKS } from "../domain/notification-kinds";
import type { Notifier } from "./notifier";
import type {
  DelayedWorkSource,
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
