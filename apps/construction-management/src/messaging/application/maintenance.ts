import type { QueueHandler } from "@/src/shared-kernel/queue";

import { retentionCutoffs } from "../domain/notification";
import { dateLabel, LINKS } from "../domain/notification-kinds";
import type { Notifier } from "./notifier";
import type {
  ContractDeadline,
  ContractDeadlinesSource,
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

// ---------------------------------------------------------------------------
// Contracts (CM-1108, ADR CM-0023 §8)
// ---------------------------------------------------------------------------

/** Daily: bank guarantees expiring and DLPs ending within 30 days. */
export const CONTRACT_DEADLINES_QUEUE_TYPE = "messaging.contract_deadlines";

export type ContractDeadlinesDeps = {
  source: ContractDeadlinesSource;
  recipients: RecipientDirectory;
  notifier: Notifier;
  clock?: () => Date;
};

function deadlineText(item: ContractDeadline): string {
  const on = dateLabel(item.date);
  if (item.kind === "guarantee")
    return `Bank guarantee ${item.label}${item.workOrderNumber == null ? (item.side === "client" ? " on the client contract" : "") : ` on ${item.workOrderNumber}`} expires ${on}`;
  return item.side === "client"
    ? `DLP of the client contract ends ${on}`
    : `DLP of ${item.label} ends ${on}`;
}

function deadlineTitle(items: readonly ContractDeadline[]): string {
  const guarantees = items.filter((item) => item.kind === "guarantee").length;
  const dlps = items.length - guarantees;
  const parts = [
    guarantees > 0
      ? count(guarantees, "bank guarantee expires", "bank guarantees expire")
      : null,
    dlps > 0 ? count(dlps, "DLP ends", "DLPs end") : null,
  ].filter((part): part is string => part != null);
  return `${parts.join(" and ")} within 30 days`;
}

/**
 * `contracts.deadlines_due`: one notice per member and Project a day,
 * listing the bank guarantees expiring and DLPs ending within 30 days that
 * the member may see: a Work Order's to Work Order Read + Notification
 * holders on the Project, the client contract's to Client Bills Read +
 * Notification holders. It links the Work Order (one), the Work Orders
 * (several) or the Client Bills page. The source key is per Project and
 * date, so a second run that day adds nothing.
 */
export async function raiseContractDeadlines(
  deps: ContractDeadlinesDeps,
): Promise<number> {
  const now = (deps.clock ?? (() => new Date()))();
  let written = 0;
  for (const due of await deps.source.due(now)) {
    const contractor = due.items.filter((item) => item.side === "contractor");
    const client = due.items.filter((item) => item.side === "client");
    const [workOrderHolders, clientHolders] = await Promise.all([
      contractor.length === 0
        ? Promise.resolve([])
        : deps.recipients.holders({
            workspaceId: due.workspaceId,
            menu: "contracts.work_orders",
            flag: "read",
            projectId: due.projectId,
          }),
      client.length === 0
        ? Promise.resolve([])
        : deps.recipients.holders({
            workspaceId: due.workspaceId,
            menu: "contracts.client_bills",
            flag: "read",
            projectId: due.projectId,
          }),
    ]);
    const seesWorkOrders = new Set(workOrderHolders);
    const seesClient = new Set(clientHolders);
    const groups = new Map<string, string[]>();
    for (const userId of new Set([...workOrderHolders, ...clientHolders])) {
      const key = `${seesWorkOrders.has(userId) ? "w" : ""}${seesClient.has(userId) ? "c" : ""}`;
      groups.set(key, [...(groups.get(key) ?? []), userId]);
    }
    for (const [key, users] of groups) {
      const items = [
        ...(key.includes("w") ? contractor : []),
        ...(key.includes("c") ? client : []),
      ].sort((a, b) => a.date.localeCompare(b.date));
      if (items.length === 0) continue;
      const workOrderIds = [
        ...new Set(
          items.flatMap((item) =>
            item.workOrderId == null ? [] : [item.workOrderId],
          ),
        ),
      ];
      const onlyClient = workOrderIds.length === 0;
      const href = onlyClient
        ? LINKS.clientBills(due.projectId)
        : workOrderIds.length === 1 && client.length === 0
          ? LINKS.workOrder(due.projectId, workOrderIds[0] ?? "")
          : LINKS.workOrders(due.projectId);
      const ids = await deps.notifier.notify(due.workspaceId, users, {
        type: "contracts.deadlines_due",
        menu: onlyClient ? "contracts.client_bills" : "contracts.work_orders",
        projectId: due.projectId,
        title:
          due.projectName == null
            ? deadlineTitle(items)
            : `${deadlineTitle(items)} in ${due.projectName}`,
        body: `${items.map(deadlineText).join("; ")}.`,
        href,
        sourceKey: `contracts.deadlines_due:${due.projectId}:${due.date}`,
      });
      written += ids.length;
    }
  }
  return written;
}

export function contractDeadlinesQueueHandler(
  deps: ContractDeadlinesDeps,
): QueueHandler {
  return {
    type: CONTRACT_DEADLINES_QUEUE_TYPE,
    timeLimitMs: 240_000,
    async run() {
      await raiseContractDeadlines(deps);
    },
  };
}
