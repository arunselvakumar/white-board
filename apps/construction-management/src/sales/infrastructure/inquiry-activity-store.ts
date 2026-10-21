import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type {
  FollowUpStore,
  InquiryTaskStore,
  StoredFollowUp,
  StoredInquiryTask,
} from "../application/inquiry-activity-handlers";
import type { SalesTx } from "../application/ports";

type FollowUpRow = Prisma.ConstructionSalesFollowUpGetPayload<object>;
type TaskRow = Prisma.ConstructionSalesInquiryTaskGetPayload<object>;

function toFollowUp(row: FollowUpRow): StoredFollowUp {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    inquiryId: row.inquiryId,
    activity: row.activity,
    doneAt: row.doneAt,
    remarks: row.remarks,
    fromStageId: row.fromStageId,
    toStageId: row.toStageId,
    nextFollowUpAt: row.nextFollowUpAt,
    nextFollowUpHasTime: row.nextFollowUpHasTime,
    memberId: row.memberId,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

function toTask(row: TaskRow): StoredInquiryTask {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    inquiryId: row.inquiryId,
    title: row.title,
    dueDate: row.dueDate == null ? null : calendarDateFromDb(row.dueDate),
    assigneeMemberId: row.assigneeMemberId,
    status: row.status,
    doneAt: row.doneAt,
    doneBy: row.doneBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

/** Follow-ups in `construction_sales.follow_ups` (CM-1004). */
export class PrismaFollowUpStore implements FollowUpStore {
  async insert(db: SalesTx, row: StoredFollowUp) {
    await db.constructionSalesFollowUp.create({ data: row });
  }

  async find(db: SalesTx, workspaceId: string, inquiryId: string, id: string) {
    const row = await db.constructionSalesFollowUp.findFirst({
      where: { id, workspaceId, inquiryId, deletedAt: null },
    });
    return row == null ? null : toFollowUp(row);
  }

  async tombstone(db: SalesTx, id: string, by: string, at: Date) {
    await db.constructionSalesFollowUp.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by },
    });
  }

  async latestDoneAt(db: SalesTx, workspaceId: string, inquiryId: string) {
    const row = await db.constructionSalesFollowUp.findFirst({
      where: { workspaceId, inquiryId, deletedAt: null },
      orderBy: { doneAt: "desc" },
      select: { doneAt: true },
    });
    return row?.doneAt ?? null;
  }

  async list(db: SalesTx, workspaceId: string, inquiryId: string) {
    const rows = await db.constructionSalesFollowUp.findMany({
      where: { workspaceId, inquiryId, deletedAt: null },
      orderBy: [{ doneAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toFollowUp);
  }
}

/** Inquiry Tasks in `construction_sales.inquiry_tasks` (CM-1004). */
export class PrismaInquiryTaskStore implements InquiryTaskStore {
  async insert(db: SalesTx, row: Parameters<InquiryTaskStore["insert"]>[1]) {
    await db.constructionSalesInquiryTask.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        inquiryId: row.inquiryId,
        title: row.title,
        dueDate: row.dueDate == null ? null : calendarDateToDb(row.dueDate),
        assigneeMemberId: row.assigneeMemberId,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
        createdBy: row.by,
        updatedBy: row.by,
      },
    });
  }

  async lock(db: SalesTx, workspaceId: string, inquiryId: string, id: string) {
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_sales.inquiry_tasks
      WHERE workspace_id = ${workspaceId}
        AND inquiry_id = ${inquiryId}::uuid
        AND id = ${id}::uuid
        AND deleted_at IS NULL
      FOR UPDATE`);
    const row = await db.constructionSalesInquiryTask.findFirst({
      where: { id, workspaceId, inquiryId, deletedAt: null },
    });
    return row == null ? null : toTask(row);
  }

  async replace(
    db: SalesTx,
    id: string,
    content: Parameters<InquiryTaskStore["replace"]>[2],
  ) {
    await db.constructionSalesInquiryTask.update({
      where: { id },
      data: {
        title: content.title,
        dueDate:
          content.dueDate == null ? null : calendarDateToDb(content.dueDate),
        assigneeMemberId: content.assigneeMemberId,
        updatedAt: content.at,
        updatedBy: content.by,
      },
    });
  }

  async setStatus(
    db: SalesTx,
    id: string,
    change: Parameters<InquiryTaskStore["setStatus"]>[2],
  ) {
    await db.constructionSalesInquiryTask.update({
      where: { id },
      data: {
        status: change.status,
        doneAt: change.doneAt,
        doneBy: change.doneBy,
        updatedAt: change.at,
        updatedBy: change.by,
      },
    });
  }

  async tombstone(db: SalesTx, id: string, by: string, at: Date) {
    await db.constructionSalesInquiryTask.update({
      where: { id },
      data: tombstone(by, at),
    });
  }

  async list(db: SalesTx, workspaceId: string, inquiryId: string) {
    const rows = await db.constructionSalesInquiryTask.findMany({
      where: { workspaceId, inquiryId, deletedAt: null },
      orderBy: [
        { status: "asc" },
        { dueDate: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
      ],
    });
    return rows.map(toTask);
  }
}
