// HTTP models for Notifications under the bell (ADR-0041). Response models
// mirror src/training-institute/application/absence-notice-views.ts exactly.

import { z } from "zod";

import { ABSENCE_REASONS } from "@/src/training-institute/domain/absence-notice";

const Id = z.uuid();

export const TrainingInstituteNotificationIdParamsModel = z.object({ id: Id });

export const ListTrainingInstituteNotificationsRequestModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    after: z.string().optional(),
    before: z.string().optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "Use either after or before cursor.",
  });

export const TrainingInstituteAbsenceNoticeNotificationPayloadModel = z.object({
  studentId: Id,
  studentName: z.string(),
  batchId: Id,
  batchName: z.string(),
  courseName: z.string(),
  timezone: z.string(),
  classes: z.array(
    z.object({
      date: z.iso.date(),
      startTime: z.string(),
      endTime: z.string(),
    }),
  ),
  reason: z.enum(ABSENCE_REASONS),
  note: z.string().nullable(),
  by: z.object({
    role: z.enum(["student", "parent"]),
    name: z.string(),
  }),
});

export const TrainingInstituteNotificationModel = z.object({
  id: Id,
  kind: z.enum(["absence_notice_given", "absence_notice_withdrawn"]),
  payload: TrainingInstituteAbsenceNoticeNotificationPayloadModel,
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export type TrainingInstituteNotificationModel = z.infer<
  typeof TrainingInstituteNotificationModel
>;

export const ListTrainingInstituteNotificationsResponseModel = z.object({
  items: z.array(TrainingInstituteNotificationModel),
  total: z.number().int(),
  unreadCount: z.number().int(),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
});
export type ListTrainingInstituteNotificationsResponseModel = z.infer<
  typeof ListTrainingInstituteNotificationsResponseModel
>;

export const TrainingInstituteUnreadNotificationsResponseModel = z.object({
  unreadCount: z.number().int(),
});
export type TrainingInstituteUnreadNotificationsResponseModel = z.infer<
  typeof TrainingInstituteUnreadNotificationsResponseModel
>;
