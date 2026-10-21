import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  followUpFields,
  followUpNotFound,
  inquiryTaskFields,
  inquiryTaskNotFound,
  type FollowUpInput,
  type InquiryTaskInput,
} from "../domain/follow-up";
import { assertInquiryOpen, inquiryNotFound } from "../domain/inquiry";
import type {
  FollowUpActivity,
  InquiryTaskStatus,
} from "../domain/sales-terms";
import {
  fromStoredFollowUpAt,
  salesLocal,
  type SalesDateTime,
} from "../domain/sales-time";
import type {
  InquiryBackdatedCheck,
  InquiryHandlers,
  InquiryHistoryItem,
  InquiryStore,
  StoredInquiry,
} from "./inquiry-handlers";
import type { SalesDirectory, SalesTx } from "./ports";
import type { SalesListStore } from "./sales-settings-handlers";

const MENU = "sales.inquiries";

// ---------------------------------------------------------------------------
// Store ports (Prisma in `infrastructure/inquiry-activity-store`)
// ---------------------------------------------------------------------------

export type StoredFollowUp = {
  id: string;
  workspaceId: string;
  projectId: string;
  inquiryId: string;
  activity: FollowUpActivity;
  doneAt: Date;
  remarks: string | null;
  fromStageId: string | null;
  toStageId: string | null;
  nextFollowUpAt: Date | null;
  nextFollowUpHasTime: boolean;
  memberId: string | null;
  createdAt: Date;
  createdBy: string;
};

export type FollowUpStore = {
  insert(db: SalesTx, row: StoredFollowUp): Promise<void>;
  /** A live follow-up of the inquiry, or null. */
  find(
    db: SalesTx,
    workspaceId: string,
    inquiryId: string,
    id: string,
  ): Promise<StoredFollowUp | null>;
  tombstone(db: SalesTx, id: string, by: string, at: Date): Promise<void>;
  /** Live follow-ups of the inquiry, newest Done on first. */
  list(
    db: SalesTx,
    workspaceId: string,
    inquiryId: string,
  ): Promise<StoredFollowUp[]>;
};

export type StoredInquiryTask = {
  id: string;
  workspaceId: string;
  inquiryId: string;
  title: string;
  dueDate: CalendarDate | null;
  assigneeMemberId: string | null;
  status: InquiryTaskStatus;
  doneAt: Date | null;
  doneBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};

export type InquiryTaskStore = {
  insert(
    db: SalesTx,
    row: Omit<
      StoredInquiryTask,
      "status" | "doneAt" | "doneBy" | "updatedAt"
    > & { by: string },
  ): Promise<void>;
  /** Locks the live task `FOR UPDATE` and reads it. */
  lock(
    db: SalesTx,
    workspaceId: string,
    inquiryId: string,
    id: string,
  ): Promise<StoredInquiryTask | null>;
  replace(
    db: SalesTx,
    id: string,
    content: {
      title: string;
      dueDate: CalendarDate | null;
      assigneeMemberId: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  setStatus(
    db: SalesTx,
    id: string,
    change: {
      status: InquiryTaskStatus;
      doneAt: Date | null;
      doneBy: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  tombstone(db: SalesTx, id: string, by: string, at: Date): Promise<void>;
  /** Live tasks: open ones by Due date (none last), then done ones. */
  list(
    db: SalesTx,
    workspaceId: string,
    inquiryId: string,
  ): Promise<StoredInquiryTask[]>;
};

export type InquiryActivityDeps = {
  db: SalesTx & {
    $transaction<T>(fn: (tx: SalesTx) => Promise<T>): Promise<T>;
  };
  inquiries: InquiryHandlers;
  inquiryStore: InquiryStore;
  followUps: FollowUpStore;
  tasks: InquiryTaskStore;
  lists: SalesListStore;
  directory: SalesDirectory;
  backdated: (access: MemberAccess) => Promise<InquiryBackdatedCheck>;
  timeZone: (workspaceId: string) => Promise<string>;
  clock?: () => Date;
};

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

type Named = { id: string; name: string | null };
type Person = { userId: string; name: string | null };

export type FollowUpReadModel = StoredFollowUp & {
  /** Done on in the Company's time zone. */
  doneOn: { date: CalendarDate; time: string };
  nextFollowUp: SalesDateTime | null;
  fromStage: Named | null;
  toStage: Named | null;
  by: Person;
  /** Inquiry Delete: remove one entered by mistake. */
  canDelete: boolean;
};

/** The detail page's timeline: follow-ups merged with the history. */
export type InquiryActivityItem =
  | { kind: "follow_up"; at: Date; followUp: FollowUpReadModel }
  | { kind: "event"; at: Date; event: InquiryHistoryItem };

export type InquiryTaskReadModel = StoredInquiryTask & {
  assignee: Named | null;
  doneByPerson: Person | null;
  createdByPerson: Person;
};

function refused(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim() ?? "";
  return text === "" ? null : text.toLowerCase();
};

/**
 * Follow-ups and Inquiry Tasks (CM-1004, ADR CM-0022 §4, §5). Both follow
 * the inquiry's View all rule (404 for one the viewer may not see).
 *
 * A follow-up needs Inquiry Update and an Open inquiry (409
 * `INQUIRY_NOT_OPEN`); its Done on is inside the back-dated window
 * `inquiry_follow_up`. Saving it sets the inquiry's next follow-up (or
 * clears it) and, with a stage move, its stage and a `stage_moved` history
 * row — all in one transaction. Follow-ups are append-only; an Inquiry
 * Delete holder removes one entered by mistake, and the inquiry's next
 * follow-up stays as it is.
 *
 * Inquiry Tasks need Inquiry Update: create, edit, done / undone, delete.
 * They are not the Tasks of module 05.
 */
export class InquiryActivityHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: InquiryActivityDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async memberOf(access: MemberAccess, projectId: string) {
    return this.deps.directory.memberOfUser(
      this.deps.db,
      access.workspaceId,
      access.userId,
      projectId,
    );
  }

  // -------------------------------------------------------------------------
  // Follow-ups
  // -------------------------------------------------------------------------

  /** Records a follow-up on an Open inquiry; returns its id. */
  async addFollowUp(
    access: MemberAccess,
    inquiryId: string,
    input: FollowUpInput,
  ): Promise<string> {
    const { db, inquiryStore, followUps, lists } = this.deps;
    const inquiry = await this.deps.inquiries.visible(access, inquiryId);
    assertCan(access, MENU, "update", { projectId: inquiry.projectId });
    assertInquiryOpen(inquiry.status);
    const ws = access.workspaceId;
    const timeZone = await this.deps.timeZone(ws);
    const now = this.clock();
    const fields = followUpFields(input, now, timeZone);
    const toStageId = clean(input.toStageId);
    if (toStageId != null && toStageId !== inquiry.funnelStageId) {
      const stage = (
        await lists.byIds(db, ws, "funnel_stage", [toStageId])
      ).get(toStageId);
      if (
        stage == null ||
        stage.deletedAt != null ||
        stage.projectId !== inquiry.projectId
      )
        throw refused(
          "FUNNEL_STAGE_NOT_FOUND",
          "This Funnel Stage was not found.",
          "toStageId",
        );
    }
    const check = await this.deps.backdated(access);
    check("inquiry_follow_up", "create", fields.doneOnDate);
    const member = await this.memberOf(access, inquiry.projectId);
    const id = newId();
    await db.$transaction(async (tx) => {
      const row = await inquiryStore.lock(tx, ws, inquiryId);
      if (row == null) throw inquiryNotFound();
      assertInquiryOpen(row.status);
      const moves = toStageId != null && toStageId !== row.funnelStageId;
      await followUps.insert(tx, {
        id,
        workspaceId: ws,
        projectId: row.projectId,
        inquiryId,
        activity: fields.activity,
        doneAt: fields.doneAt,
        remarks: fields.remarks,
        fromStageId: moves ? row.funnelStageId : null,
        toStageId: moves ? toStageId : null,
        nextFollowUpAt: fields.next?.at ?? null,
        nextFollowUpHasTime: fields.next?.hasTime ?? false,
        memberId: member?.id ?? null,
        createdAt: now,
        createdBy: access.userId,
      });
      await inquiryStore.setProgress(tx, inquiryId, {
        funnelStageId: moves ? toStageId : row.funnelStageId,
        nextFollowUpAt: fields.next?.at ?? null,
        nextFollowUpHasTime: fields.next?.hasTime ?? false,
        by: access.userId,
        at: now,
      });
      if (moves)
        await inquiryStore.appendEvents(
          tx,
          ws,
          [
            {
              inquiryId,
              type: "stage_moved",
              details: {
                fromStageId: row.funnelStageId,
                toStageId,
                followUpId: id,
              },
            },
          ],
          access.userId,
          now,
        );
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "inquiry.follow_up_added",
        entityType: "inquiry",
        entityId: inquiryId,
        after: {
          followUpId: id,
          activity: fields.activity,
          doneAt: fields.doneAt.toISOString(),
          remarks: fields.remarks,
          toStageId: moves ? toStageId : null,
          nextFollowUpAt: fields.next?.at.toISOString() ?? null,
        },
        occurredAt: now,
      });
    });
    return id;
  }

  /**
   * Removes a follow-up entered by mistake (Inquiry Delete). The back-dated
   * edit limit applies to its Done on.
   */
  async deleteFollowUp(
    access: MemberAccess,
    inquiryId: string,
    followUpId: string,
  ): Promise<void> {
    const { db, followUps } = this.deps;
    const inquiry = await this.deps.inquiries.visible(access, inquiryId);
    assertCan(access, MENU, "delete", { projectId: inquiry.projectId });
    const [timeZone, check] = await Promise.all([
      this.deps.timeZone(access.workspaceId),
      this.deps.backdated(access),
    ]);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const row = await followUps.find(
        tx,
        access.workspaceId,
        inquiryId,
        followUpId,
      );
      if (row == null) throw followUpNotFound();
      check("inquiry_follow_up", "edit", salesLocal(row.doneAt, timeZone).date);
      await followUps.tombstone(tx, followUpId, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inquiry.follow_up_deleted",
        entityType: "inquiry",
        entityId: inquiryId,
        before: {
          followUpId,
          activity: row.activity,
          doneAt: row.doneAt.toISOString(),
          remarks: row.remarks,
        },
        occurredAt: at,
      });
    });
  }

  private async followUpModels(
    access: MemberAccess,
    inquiry: StoredInquiry,
    rows: readonly StoredFollowUp[],
  ): Promise<FollowUpReadModel[]> {
    const { db, lists, directory } = this.deps;
    const ws = access.workspaceId;
    const stageIds = rows.flatMap((row) =>
      [row.fromStageId, row.toStageId].filter((id): id is string => id != null),
    );
    const [timeZone, stages, users] = await Promise.all([
      this.deps.timeZone(ws),
      lists.byIds(db, ws, "funnel_stage", stageIds),
      directory.userNames(
        db,
        ws,
        rows.map((row) => row.createdBy),
      ),
    ]);
    const canDelete = can(access, MENU, "delete", {
      projectId: inquiry.projectId,
    });
    const named = (id: string | null): Named | null =>
      id == null ? null : { id, name: stages.get(id)?.name ?? null };
    return rows.map((row) => ({
      ...row,
      doneOn: salesLocal(row.doneAt, timeZone),
      nextFollowUp: fromStoredFollowUpAt(
        { at: row.nextFollowUpAt, hasTime: row.nextFollowUpHasTime },
        timeZone,
      ),
      fromStage: named(row.fromStageId),
      toStage: named(row.toStageId),
      by: { userId: row.createdBy, name: users.get(row.createdBy) ?? null },
      canDelete,
    }));
  }

  /**
   * The detail page's timeline, newest first: follow-ups (by Done on)
   * merged with the history rows (a follow-up's own stage move is shown
   * on the follow-up, not twice).
   */
  async activity(
    access: MemberAccess,
    inquiryId: string,
  ): Promise<InquiryActivityItem[]> {
    const inquiry = await this.deps.inquiries.visible(access, inquiryId);
    const [rows, history] = await Promise.all([
      this.deps.followUps.list(this.deps.db, access.workspaceId, inquiryId),
      this.deps.inquiries.history(
        access.workspaceId,
        inquiry.projectId,
        inquiryId,
      ),
    ]);
    const followUps = await this.followUpModels(access, inquiry, rows);
    const items: InquiryActivityItem[] = [
      ...followUps.map((followUp) => ({
        kind: "follow_up" as const,
        at: followUp.doneAt,
        followUp,
      })),
      ...history
        .filter((event) => event.details?.["followUpId"] == null)
        .map((event) => ({
          kind: "event" as const,
          at: event.occurredAt,
          event,
        })),
    ];
    return items.sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  // -------------------------------------------------------------------------
  // Inquiry Tasks
  // -------------------------------------------------------------------------

  private async assignee(
    access: MemberAccess,
    projectId: string,
    raw: string | null | undefined,
    current: string | null,
  ): Promise<string | null> {
    const id = clean(raw);
    if (id == null || id === current) return id;
    const member = (
      await this.deps.directory.members(
        this.deps.db,
        access.workspaceId,
        projectId,
        [id],
      )
    ).get(id);
    if (member == null)
      throw refused(
        "TEAM_MEMBER_NOT_FOUND",
        "This Team Member was not found.",
        "assigneeMemberId",
      );
    if (!member.onProject || !member.active)
      throw refused(
        "ASSIGNEE_NOT_ON_PROJECT",
        "Assign the task to an active Team Member on this Project.",
        "assigneeMemberId",
      );
    return id;
  }

  private async taskInquiry(access: MemberAccess, inquiryId: string) {
    const inquiry = await this.deps.inquiries.visible(access, inquiryId);
    assertCan(access, MENU, "update", { projectId: inquiry.projectId });
    return inquiry;
  }

  /** Adds an Inquiry Task (Inquiry Update); returns its id. */
  async createTask(
    access: MemberAccess,
    inquiryId: string,
    input: InquiryTaskInput,
  ): Promise<string> {
    const inquiry = await this.taskInquiry(access, inquiryId);
    const fields = inquiryTaskFields(input);
    const assigneeMemberId = await this.assignee(
      access,
      inquiry.projectId,
      input.assigneeMemberId,
      null,
    );
    const id = newId();
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const row = await this.deps.inquiryStore.lock(
        tx,
        access.workspaceId,
        inquiryId,
      );
      if (row == null) throw inquiryNotFound();
      await this.deps.tasks.insert(tx, {
        id,
        workspaceId: access.workspaceId,
        inquiryId,
        title: fields.title,
        dueDate: fields.dueDate,
        assigneeMemberId,
        createdAt: at,
        createdBy: access.userId,
        by: access.userId,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inquiry_task.created",
        entityType: "inquiry_task",
        entityId: id,
        after: { inquiryId, ...fields, assigneeMemberId },
        occurredAt: at,
      });
    });
    return id;
  }

  private changed(task: StoredInquiryTask, expectedUpdatedAt: Date): void {
    if (task.updatedAt.getTime() !== expectedUpdatedAt.getTime())
      throw conflict(
        "INQUIRY_TASK_CHANGED",
        "Someone changed this task. Reload it and try again.",
        { updatedAt: task.updatedAt.toISOString() },
      );
  }

  /** Edits a task's title, Due date and assignee. 409 `INQUIRY_TASK_CHANGED`. */
  async editTask(
    access: MemberAccess,
    inquiryId: string,
    taskId: string,
    expectedUpdatedAt: Date,
    input: InquiryTaskInput,
  ): Promise<void> {
    const inquiry = await this.taskInquiry(access, inquiryId);
    const fields = inquiryTaskFields(input);
    const at = this.clock();
    const current = await this.deps.db.$transaction((tx) =>
      this.deps.tasks.lock(tx, access.workspaceId, inquiryId, taskId),
    );
    if (current == null) throw inquiryTaskNotFound();
    const assigneeMemberId = await this.assignee(
      access,
      inquiry.projectId,
      input.assigneeMemberId,
      current.assigneeMemberId,
    );
    await this.deps.db.$transaction(async (tx) => {
      const row = await this.deps.tasks.lock(
        tx,
        access.workspaceId,
        inquiryId,
        taskId,
      );
      if (row == null) throw inquiryTaskNotFound();
      this.changed(row, expectedUpdatedAt);
      await this.deps.tasks.replace(tx, taskId, {
        ...fields,
        assigneeMemberId,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inquiry_task.updated",
        entityType: "inquiry_task",
        entityId: taskId,
        before: {
          title: row.title,
          dueDate: row.dueDate,
          assigneeMemberId: row.assigneeMemberId,
        },
        after: { ...fields, assigneeMemberId },
        occurredAt: at,
      });
    });
  }

  /** Ticks a task Done (with who and when) or back to Open. */
  async setTaskDone(
    access: MemberAccess,
    inquiryId: string,
    taskId: string,
    done: boolean,
  ): Promise<void> {
    await this.taskInquiry(access, inquiryId);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const row = await this.deps.tasks.lock(
        tx,
        access.workspaceId,
        inquiryId,
        taskId,
      );
      if (row == null) throw inquiryTaskNotFound();
      const status = done ? "done" : "open";
      if (row.status === status) return;
      await this.deps.tasks.setStatus(tx, taskId, {
        status,
        doneAt: done ? at : null,
        doneBy: done ? access.userId : null,
        by: access.userId,
        at,
      });
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: done ? "inquiry_task.done" : "inquiry_task.reopened",
        entityType: "inquiry_task",
        entityId: taskId,
        before: { status: row.status },
        after: { status },
        occurredAt: at,
      });
    });
  }

  /** Deletes a task (a tombstone; Inquiry Update). */
  async deleteTask(
    access: MemberAccess,
    inquiryId: string,
    taskId: string,
  ): Promise<void> {
    await this.taskInquiry(access, inquiryId);
    const at = this.clock();
    await this.deps.db.$transaction(async (tx) => {
      const row = await this.deps.tasks.lock(
        tx,
        access.workspaceId,
        inquiryId,
        taskId,
      );
      if (row == null) throw inquiryTaskNotFound();
      await this.deps.tasks.tombstone(tx, taskId, access.userId, at);
      await recordAudit(tx, {
        workspaceId: access.workspaceId,
        actorUserId: access.userId,
        action: "inquiry_task.deleted",
        entityType: "inquiry_task",
        entityId: taskId,
        before: { inquiryId, title: row.title, status: row.status },
        occurredAt: at,
      });
    });
  }

  /** The inquiry's tasks: open ones by Due date, then done ones. */
  async tasks(
    access: MemberAccess,
    inquiryId: string,
  ): Promise<InquiryTaskReadModel[]> {
    const inquiry = await this.deps.inquiries.visible(access, inquiryId);
    const { db, directory } = this.deps;
    const ws = access.workspaceId;
    const rows = await this.deps.tasks.list(db, ws, inquiryId);
    const [members, users] = await Promise.all([
      directory.members(
        db,
        ws,
        inquiry.projectId,
        rows.flatMap((row) =>
          row.assigneeMemberId == null ? [] : [row.assigneeMemberId],
        ),
      ),
      directory.userNames(db, ws, [
        ...rows.map((row) => row.createdBy),
        ...rows.flatMap((row) => (row.doneBy == null ? [] : [row.doneBy])),
      ]),
    ]);
    return rows.map((row) => ({
      ...row,
      assignee:
        row.assigneeMemberId == null
          ? null
          : {
              id: row.assigneeMemberId,
              name: members.get(row.assigneeMemberId)?.name ?? null,
            },
      doneByPerson:
        row.doneBy == null
          ? null
          : { userId: row.doneBy, name: users.get(row.doneBy) ?? null },
      createdByPerson: {
        userId: row.createdBy,
        name: users.get(row.createdBy) ?? null,
      },
    }));
  }
}
