// HTTP models for Tests and results (ADR-0038). Response models mirror
// application/class-test-views.ts.

import { z } from "zod";

const Id = z.uuid();
const CalendarDate = z.iso.date();
const ResultStatus = z.enum(["scored", "absent", "exempt"]);

export const TrainingInstituteClassTestIdParamsModel = z.object({ id: Id });

const testDetailFields = {
  name: z.string().max(200),
  heldOn: CalendarDate,
  maxMarks: z.number().int(),
  passMarks: z.number().int().nullish(),
  topic: z.string().max(1000).nullish(),
};

export const CreateTrainingInstituteClassTestRequestModel = z.object({
  ...testDetailFields,
  /** Set for a single-student Test, such as a re-test. */
  studentId: Id.nullish(),
});

export const UpdateTrainingInstituteClassTestRequestModel =
  z.object(testDetailFields);

export const SaveTrainingInstituteTestResultsRequestModel = z.object({
  results: z
    .array(
      z.object({
        studentId: Id,
        /** Null leaves the Student blank; only a draft allows it. */
        status: ResultStatus.nullable(),
        marks: z.number().nullish(),
        remark: z.string().max(500).nullish(),
        /** The result's updatedAt when the page loaded; null if it was blank. */
        expectedUpdatedAt: z.iso.datetime().nullable(),
      }),
    )
    .max(500),
});

const Student = z.object({ id: Id, name: z.string() });

const PostedBy = z.object({
  role: z.enum(["owner", "teacher"]),
  teacherName: z.string().nullable(),
});

const ClassTestBatch = z.object({
  id: Id,
  name: z.string(),
  courseName: z.string(),
  timezone: z.string(),
  closed: z.boolean(),
});

const ResultValue = z.object({
  status: ResultStatus,
  marks: z.number().nullable(),
  remark: z.string().nullable(),
});

export const TrainingInstituteTestResultModel = ResultValue.extend({
  passed: z.boolean().nullable(),
  updatedAt: z.iso.datetime(),
});

export const TrainingInstituteClassTestModel = z.object({
  id: Id,
  batchId: Id,
  name: z.string(),
  heldOn: CalendarDate,
  maxMarks: z.number().int(),
  passMarks: z.number().int().nullable(),
  topic: z.string().nullable(),
  scope: z.enum(["batch", "student"]),
  student: Student.nullable(),
  createdBy: PostedBy,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
});

export const TrainingInstituteTestSummaryModel = z.object({
  listed: z.number().int(),
  entered: z.number().int(),
  tested: z.number().int(),
  absent: z.number().int(),
  exempt: z.number().int(),
  average: z.number().nullable(),
  highest: z.number().nullable(),
  lowest: z.number().nullable(),
  belowPass: z.array(Student.extend({ marks: z.number() })),
  absentStudents: z.array(Student),
  exemptStudents: z.array(Student),
});

export const TrainingInstituteStaffClassTestModel =
  TrainingInstituteClassTestModel.extend({
    summary: TrainingInstituteTestSummaryModel,
  });

export const TrainingInstituteBatchTestsResponseModel = z.object({
  batch: ClassTestBatch,
  today: CalendarDate,
  firstDate: CalendarDate,
  canCreate: z.boolean(),
  students: z.array(
    Student.extend({ start: CalendarDate, end: CalendarDate.nullable() }),
  ),
  tests: z.array(TrainingInstituteStaffClassTestModel),
});

export const TrainingInstituteClassTestDetailResponseModel = z.object({
  batch: ClassTestBatch,
  today: CalendarDate,
  firstDate: CalendarDate,
  test: TrainingInstituteStaffClassTestModel,
  canDelete: z.boolean(),
  rows: z.array(
    z.object({
      student: Student,
      result: TrainingInstituteTestResultModel.nullable(),
      history: z.array(
        z.object({
          changedAt: z.iso.datetime(),
          changedBy: PostedBy,
          before: ResultValue,
          after: ResultValue,
        }),
      ),
    }),
  ),
});

export const DeleteTrainingInstituteClassTestResponseModel = z.object({
  id: Id,
});

export const TrainingInstituteStudentTestHistoryResponseModel = z.object({
  student: Student,
  tests: z.array(
    TrainingInstituteClassTestModel.extend({
      batch: ClassTestBatch,
      result: TrainingInstituteTestResultModel.nullable(),
    }),
  ),
});

export const TrainingInstituteFamilyTestResultModel = z.object({
  testId: Id,
  batch: z.object({ id: Id, name: z.string(), courseName: z.string() }),
  name: z.string(),
  heldOn: CalendarDate,
  maxMarks: z.number().int(),
  passMarks: z.number().int().nullable(),
  topic: z.string().nullable(),
  scope: z.enum(["batch", "student"]),
  status: ResultStatus,
  marks: z.number().nullable(),
  passed: z.boolean().nullable(),
  remark: z.string().nullable(),
  publishedAt: z.iso.datetime(),
});

export const TrainingInstituteFamilyTestResultsResponseModel = z.object({
  students: z.array(
    Student.extend({
      results: z.array(TrainingInstituteFamilyTestResultModel),
    }),
  ),
});
