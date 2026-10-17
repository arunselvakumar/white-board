import { z } from "zod";

import type {
  FollowUpReadModel,
  InquiryActivityItem,
  InquiryTaskReadModel,
} from "@/src/sales/application/inquiry-activity-handlers";
import type {
  FollowUpInput,
  InquiryTaskInput,
} from "@/src/sales/domain/follow-up";
import {
  FOLLOW_UP_ACTIVITIES,
  INQUIRY_TASK_STATUSES,
  SALES_LIMITS,
} from "@/src/sales/domain/sales-terms";

import {
  ConstructionSalesDateTimeResponseModel,
  ConstructionSalesInquiryHistoryItemResponseModel,
  toInquiryHistoryResponse,
} from "./inquiry-models";

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe("`HH:MM` in the Company's time zone.");

const person = z.object({ userId: z.string(), name: z.string().nullable() });
const named = z.object({ id: z.uuid(), name: z.string().nullable() });

export const ConstructionSalesFollowUpParamsModel = z.object({
  id: z.uuid(),
  followUpId: z.uuid(),
});

export const ConstructionSalesInquiryTaskParamsModel = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
});

export const AddConstructionSalesFollowUpRequestModel = z.object({
  /** Call, Site visit, Meeting, WhatsApp, Email or Other; Call Activity counts calls. */
  activity: z.enum(FOLLOW_UP_ACTIVITIES),
  /** Done on: not in the future; back-dated window `inquiry_follow_up`. */
  doneOnDate: z.iso.date(),
  doneOnTime: time,
  remarks: z
    .string()
    .max(SALES_LIMITS.remarks * 2)
    .nullable()
    .optional(),
  /** A live Funnel Stage to move the inquiry to; null or left out keeps it. */
  toStageId: z.uuid().nullable().optional(),
  /**
   * The next follow-up, after Done on (a date alone: the same day or
   * later); left out or null clears the inquiry's next follow-up.
   */
  nextFollowUpDate: z.iso.date().nullable().optional(),
  nextFollowUpTime: time.nullable().optional(),
});

export const ConstructionSalesFollowUpResponseModel = z.object({
  id: z.uuid(),
  inquiryId: z.uuid(),
  activity: z.enum(FOLLOW_UP_ACTIVITIES),
  doneAt: z.iso.datetime(),
  /** Done on in the Company's time zone. */
  doneOn: z.object({ date: z.iso.date(), time: z.string() }),
  remarks: z.string().nullable(),
  /** Set when it moved the stage. */
  fromStage: named.nullable(),
  toStage: named.nullable(),
  nextFollowUp: ConstructionSalesDateTimeResponseModel.nullable(),
  by: person,
  createdAt: z.iso.datetime(),
  /** Inquiry Delete: remove one entered by mistake. */
  canDelete: z.boolean(),
});
export type ConstructionSalesFollowUpResponse = z.infer<
  typeof ConstructionSalesFollowUpResponseModel
>;

export const ConstructionSalesInquiryActivityItemResponseModel =
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("follow_up"),
      at: z.iso.datetime(),
      followUp: ConstructionSalesFollowUpResponseModel,
    }),
    z.object({
      kind: z.literal("event"),
      at: z.iso.datetime(),
      event: ConstructionSalesInquiryHistoryItemResponseModel,
    }),
  ]);
export type ConstructionSalesInquiryActivityItemResponse = z.infer<
  typeof ConstructionSalesInquiryActivityItemResponseModel
>;

export const ListConstructionSalesInquiryActivityResponseModel = z.object({
  /** Newest first: follow-ups (by Done on) merged with the history. */
  items: z.array(ConstructionSalesInquiryActivityItemResponseModel),
});
export type ListConstructionSalesInquiryActivityResponse = z.infer<
  typeof ListConstructionSalesInquiryActivityResponseModel
>;

const TaskBody = z.object({
  /** Required, at most 200 characters. */
  title: z.string().max(SALES_LIMITS.taskTitle * 2),
  dueDate: z.iso.date().nullable().optional(),
  /** An active Team Member on the Project. */
  assigneeMemberId: z.uuid().nullable().optional(),
});

export const CreateConstructionSalesInquiryTaskRequestModel = TaskBody;

export const UpdateConstructionSalesInquiryTaskRequestModel = TaskBody.extend({
  /** The task's `updatedAt` as last seen; 409 `INQUIRY_TASK_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const ConstructionSalesInquiryTaskResponseModel = z.object({
  id: z.uuid(),
  inquiryId: z.uuid(),
  title: z.string(),
  dueDate: z.iso.date().nullable(),
  assignee: named.nullable(),
  status: z.enum(INQUIRY_TASK_STATUSES),
  doneAt: z.iso.datetime().nullable(),
  doneBy: person.nullable(),
  createdBy: person,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionSalesInquiryTaskResponse = z.infer<
  typeof ConstructionSalesInquiryTaskResponseModel
>;

export const ListConstructionSalesInquiryTasksResponseModel = z.object({
  /** Open ones by Due date (none last), then done ones. */
  items: z.array(ConstructionSalesInquiryTaskResponseModel),
  /** Inquiry Update: add, edit, tick and delete. */
  canManage: z.boolean(),
});
export type ListConstructionSalesInquiryTasksResponse = z.infer<
  typeof ListConstructionSalesInquiryTasksResponseModel
>;

export function toFollowUpInput(
  body: z.infer<typeof AddConstructionSalesFollowUpRequestModel>,
): FollowUpInput {
  return {
    activity: body.activity,
    doneOn: { date: body.doneOnDate, time: body.doneOnTime },
    remarks: body.remarks,
    toStageId: body.toStageId,
    nextFollowUp:
      body.nextFollowUpDate == null
        ? null
        : { date: body.nextFollowUpDate, time: body.nextFollowUpTime ?? null },
  };
}

export function toInquiryTaskInput(
  body: z.infer<typeof TaskBody>,
): InquiryTaskInput {
  return {
    title: body.title,
    dueDate: body.dueDate,
    assigneeMemberId: body.assigneeMemberId,
  };
}

export function toFollowUpResponse(
  followUp: FollowUpReadModel,
): ConstructionSalesFollowUpResponse {
  return {
    id: followUp.id,
    inquiryId: followUp.inquiryId,
    activity: followUp.activity,
    doneAt: followUp.doneAt.toISOString(),
    doneOn: followUp.doneOn,
    remarks: followUp.remarks,
    fromStage: followUp.fromStage,
    toStage: followUp.toStage,
    nextFollowUp: followUp.nextFollowUp,
    by: followUp.by,
    createdAt: followUp.createdAt.toISOString(),
    canDelete: followUp.canDelete,
  };
}

export function toActivityResponse(
  items: readonly InquiryActivityItem[],
): ListConstructionSalesInquiryActivityResponse {
  return {
    items: items.map((item) =>
      item.kind === "follow_up"
        ? {
            kind: "follow_up",
            at: item.at.toISOString(),
            followUp: toFollowUpResponse(item.followUp),
          }
        : {
            kind: "event",
            at: item.at.toISOString(),
            event: toInquiryHistoryResponse(item.event),
          },
    ),
  };
}

export function toInquiryTaskResponse(
  task: InquiryTaskReadModel,
): ConstructionSalesInquiryTaskResponse {
  return {
    id: task.id,
    inquiryId: task.inquiryId,
    title: task.title,
    dueDate: task.dueDate,
    assignee: task.assignee,
    status: task.status,
    doneAt: task.doneAt?.toISOString() ?? null,
    doneBy: task.doneByPerson,
    createdBy: task.createdByPerson,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
