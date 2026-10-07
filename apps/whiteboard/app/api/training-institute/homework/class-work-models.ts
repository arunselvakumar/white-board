// HTTP models for Study Material, Homework, Submissions, and attachments
// (ADR-0033). Response models mirror application/class-work-views.ts.

import { z } from "zod";

const Id = z.uuid();
const CalendarDate = z.iso.date();
const AttachmentIds = z.array(Id).max(5).optional().default([]);
const NullableText = (max: number) => z.string().max(max).nullish();

export const TrainingInstituteClassWorkIdParamsModel = z.object({ id: Id });

export const TrainingInstituteHomeworkSubmissionParamsModel = z.object({
  id: Id,
  submissionId: Id,
});

export const PostTrainingInstituteStudyMaterialRequestModel = z.object({
  title: z.string().max(200),
  note: NullableText(2000),
  linkUrl: NullableText(2048),
  classDate: CalendarDate.nullish(),
  attachmentIds: AttachmentIds,
});

export const UpdateTrainingInstituteStudyMaterialRequestModel =
  PostTrainingInstituteStudyMaterialRequestModel.extend({});

export const SetTrainingInstituteHomeworkRequestModel = z.object({
  title: z.string().max(200),
  instructions: z.string().max(5000),
  classDate: CalendarDate,
  dueOn: CalendarDate,
  attachmentIds: AttachmentIds,
});

export const UpdateTrainingInstituteHomeworkRequestModel =
  SetTrainingInstituteHomeworkRequestModel.extend({});

export const CheckTrainingInstituteHomeworkSubmissionRequestModel = z.object({
  remark: NullableText(500),
});

export const SubmitTrainingInstituteHomeworkRequestModel = z.object({
  studentId: Id,
  note: NullableText(1000),
  attachmentIds: AttachmentIds,
});

export const UndoTrainingInstituteHomeworkSubmissionRequestModel = z.object({
  studentId: Id,
});

export const UploadTrainingInstituteAttachmentRequestModel = z.object({
  name: z.string().max(400).optional(),
});

export const TrainingInstituteAttachmentModel = z.object({
  id: Id,
  name: z.string(),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  sizeBytes: z.number().int(),
});

const PostedBy = z.object({
  role: z.enum(["owner", "teacher"]),
  teacherName: z.string().nullable(),
});

const itemFields = {
  id: Id,
  batchId: Id,
  title: z.string(),
  postedBy: PostedBy,
  postedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  attachments: z.array(TrainingInstituteAttachmentModel),
};

export const TrainingInstituteStudyMaterialModel = z.object({
  ...itemFields,
  note: z.string().nullable(),
  linkUrl: z.string().nullable(),
  classDate: CalendarDate.nullable(),
  removedAt: z.iso.datetime().nullable(),
});

export const TrainingInstituteHomeworkModel = z.object({
  ...itemFields,
  instructions: z.string(),
  classDate: CalendarDate,
  dueOn: CalendarDate,
  removedAt: z.iso.datetime().nullable(),
});

const Counts = z.object({
  submitted: z.number().int(),
  late: z.number().int(),
  notSubmitted: z.number().int(),
  checked: z.number().int(),
});

const ClassWorkBatch = z.object({
  id: Id,
  name: z.string(),
  courseName: z.string(),
  classMode: z.enum(["offline", "online", "hybrid"]),
  timezone: z.string(),
  closed: z.boolean(),
});

export const TrainingInstituteBatchClassWorkResponseModel = z.object({
  batch: ClassWorkBatch,
  today: CalendarDate,
  canEdit: z.boolean(),
  classDates: z.array(
    z.object({
      date: CalendarDate,
      startTime: z.string(),
      endTime: z.string(),
    }),
  ),
  materials: z.array(TrainingInstituteStudyMaterialModel),
  homework: z.array(TrainingInstituteHomeworkModel.extend({ counts: Counts })),
});

export const TrainingInstituteHomeworkSubmissionModel = z.object({
  id: Id,
  note: z.string().nullable(),
  submittedAt: z.iso.datetime(),
  submittedBy: z.enum(["student", "parent"]),
  updatedAt: z.iso.datetime(),
  late: z.boolean(),
  checkedAt: z.iso.datetime().nullable(),
  remark: z.string().nullable(),
  attachments: z.array(TrainingInstituteAttachmentModel),
});

export const TrainingInstituteHomeworkSubmissionsResponseModel = z.object({
  batch: ClassWorkBatch,
  today: CalendarDate,
  homework: TrainingInstituteHomeworkModel,
  counts: Counts,
  students: z.array(
    z.object({
      studentId: Id,
      studentName: z.string(),
      status: z.enum(["submitted", "late", "not_submitted"]),
      inBatch: z.boolean(),
      submission: TrainingInstituteHomeworkSubmissionModel.nullable(),
    }),
  ),
});

export const TrainingInstituteFamilyHomeworkModel =
  TrainingInstituteHomeworkModel.omit({ removedAt: true }).extend({
    status: z.enum([
      "due",
      "overdue",
      "submitted",
      "late",
      "checked",
      "reference",
    ]),
    canSubmit: z.boolean(),
    submission: TrainingInstituteHomeworkSubmissionModel.nullable(),
  });

export const TrainingInstituteFamilyClassWorkResponseModel = z.object({
  students: z.array(
    z.object({
      id: Id,
      name: z.string(),
      batches: z.array(
        z.object({
          id: Id,
          name: z.string(),
          courseName: z.string(),
          timezone: z.string(),
          access: z.enum(["active", "ended"]),
        }),
      ),
      homework: z.array(TrainingInstituteFamilyHomeworkModel),
      materials: z.array(
        TrainingInstituteStudyMaterialModel.omit({ removedAt: true }),
      ),
    }),
  ),
});
