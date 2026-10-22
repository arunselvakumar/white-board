import type { NotificationRecipientsQuery } from "@/src/shared-kernel/access/notification-recipients";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type {
  NotificationAttachment,
  NotificationDraft,
  PushPayload,
} from "../domain/notification";

/** A stored notification. */
export type NotificationRecord = {
  id: string;
  workspaceId: string;
  recipientUserId: string;
  menu: string | null;
  projectId: string | null;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  attachment: NotificationAttachment | null;
  readAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
};

export type NewNotification = NotificationDraft & {
  workspaceId: string;
  recipientUserId: string;
};

export type DeliveryLog = {
  notificationId: string | null;
  workspaceId: string;
  recipientUserId: string;
  channel: "in_app" | "web_push";
  status: "sent" | "failed" | "skipped";
  pushSubscriptionId?: string | null;
  error?: string | null;
};

export type NotificationStore = {
  /**
   * In one transaction: inserts one row per recipient (a repeated
   * `(recipient, sourceKey)` adds nothing), logs each new row's in-app
   * delivery and enqueues one `push` job per new row. Returns the new
   * rows' ids and their push job ids.
   */
  insert(
    rows: readonly NewNotification[],
    now: Date,
  ): Promise<{ notificationIds: string[]; pushJobIds: string[] }>;
  /** Newest first, not deleted, in one Company, for one member. */
  list(query: {
    workspaceId: string;
    userId: string;
    cursor: ListCursor | null;
    limit: number;
  }): Promise<NotificationRecord[]>;
  unreadCount(workspaceId: string, userId: string): Promise<number>;
  /** The newest unread, not deleted notification of `types` since `since`. */
  latestUnread(query: {
    workspaceId: string;
    userId: string;
    types: readonly string[];
    since: Date;
  }): Promise<NotificationRecord | null>;
  /** Null when it is not this member's in this Company (or deleted). */
  markRead(
    scope: { workspaceId: string; userId: string; id: string },
    at: Date,
  ): Promise<NotificationRecord | null>;
  markAllRead(workspaceId: string, userId: string, at: Date): Promise<number>;
  /** False when it is not this member's in this Company (or deleted). */
  hide(
    scope: { workspaceId: string; userId: string; id: string },
    at: Date,
  ): Promise<boolean>;
  /** Any notification by id, deleted ones included (the push job). */
  find(id: string): Promise<NotificationRecord | null>;
  logDeliveries(rows: readonly DeliveryLog[], at: Date): Promise<void>;
  /** Retention: notifications and delivery rows older than the cutoffs. */
  purge(cutoffs: {
    notificationsBefore: Date;
    deliveriesBefore: Date;
  }): Promise<{ notifications: number; deliveries: number }>;
};

export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSubscriptionStore = {
  /** Saves (or moves to this user and session) the browser's endpoint. */
  save(
    input: {
      userId: string;
      sessionId: string | null;
      endpoint: string;
      p256dh: string;
      auth: string;
      userAgent: string | null;
    },
    now: Date,
  ): Promise<{ id: string }>;
  remove(userId: string, endpoint: string): Promise<void>;
  ofUser(userId: string): Promise<PushSubscriptionRecord[]>;
  deleteIds(ids: readonly string[]): Promise<void>;
  touch(ids: readonly string[], at: Date): Promise<void>;
};

export type PreferenceStore = {
  mutedGroups(userId: string): Promise<string[]>;
  save(
    userId: string,
    mutedGroups: readonly string[],
    now: Date,
  ): Promise<void>;
};

export type PushSendResult =
  | { ok: true }
  | {
      ok: false;
      /** The push service says the subscription is gone (404/410). */
      gone: boolean;
      error: string;
    };

/** Sends one web push (`web-push` with VAPID in production; a fake in tests). */
export type PushSender = {
  /** False when the VAPID keys are not set: push is skipped. */
  readonly configured: boolean;
  send(
    subscription: PushSubscriptionRecord,
    payload: PushPayload,
  ): Promise<PushSendResult>;
};

/** Who may receive a notification (the kernel's matrix query). */
export type RecipientDirectory = {
  holders(query: NotificationRecipientsQuery): Promise<string[]>;
  /** User ids of active Team Members. */
  usersOfMembers(
    workspaceId: string,
    memberIds: readonly string[],
  ): Promise<string[]>;
};

/**
 * Names and links from other contexts, read in the composition root so
 * a notification can say "Task #12 — Shuttering" rather than an id. Each
 * returns null when the record is gone.
 */
export type NotificationNames = {
  project(workspaceId: string, projectId: string): Promise<string | null>;
  task(workspaceId: string, taskId: string): Promise<string | null>;
  material(workspaceId: string, materialId: string): Promise<string | null>;
  location(
    workspaceId: string,
    location: { kind: string; id: string },
  ): Promise<string | null>;
  /** "Task Report" for a report kind. */
  reportTitle(kind: string): string;
  /** A finished report's download links. */
  reportDownloads(
    workspaceId: string,
    reportJobId: string,
  ): Promise<{ label: string; href: string }[]>;
};

/** A task or issue whose due date was yesterday in its Company's today. */
export type BecameDelayed = {
  kind: "task" | "issue";
  workspaceId: string;
  projectId: string;
  id: string;
  /** "Task #12 — Shuttering" or "Issue ISS-0003". */
  name: string;
  dueDate: CalendarDate;
  assigneeMemberIds: readonly string[];
};

/** Tracking's open tasks and issues, read across contexts in composition. */
export type DelayedWorkSource = {
  becameDelayed(now: Date): Promise<BecameDelayed[]>;
};

// ---------------------------------------------------------------------------
// Sales (CM-1004, ADR CM-0022 §10)
// ---------------------------------------------------------------------------

/** One assignee's open inquiries due on a Project, on the Company's today. */
export type FollowUpsDue = {
  workspaceId: string;
  projectId: string;
  assigneeMemberId: string;
  /** The Company's today. */
  date: CalendarDate;
  overdue: number;
  today: number;
};

/** Sales' open inquiries with a next follow-up, read across contexts in composition. */
export type FollowUpsDueSource = {
  due(now: Date): Promise<FollowUpsDue[]>;
};

// ---------------------------------------------------------------------------
// Contracts (CM-1108): bank guarantees expiring and DLPs ending soon
// ---------------------------------------------------------------------------

/** One bank guarantee expiring or DLP ending within the notice window. */
export type ContractDeadline = {
  /** Work Order (contractor) or client contract (client): who is told. */
  side: "contractor" | "client";
  kind: "guarantee" | "dlp";
  /** "BG/2026/001 (State Bank of India)", "WO/26-27/00001", "client contract". */
  label: string;
  /** The Work Order it is on (contractor side). */
  workOrderId: string | null;
  workOrderNumber: string | null;
  date: CalendarDate;
};

/** A Project's deadlines due within 30 days of its Company's today. */
export type ContractDeadlinesDue = {
  workspaceId: string;
  projectId: string;
  projectName: string | null;
  /** The Company's today. */
  date: CalendarDate;
  items: ContractDeadline[];
};

/** Contracts' guarantees and DLPs, read across contexts in composition. */
export type ContractDeadlinesSource = {
  due(now: Date): Promise<ContractDeadlinesDue[]>;
};
