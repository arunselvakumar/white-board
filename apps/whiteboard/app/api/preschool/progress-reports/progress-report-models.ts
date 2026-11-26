import { z } from "zod";

const Term = z.enum(["term_1", "term_2", "term_3"]);
const Rating = z.enum(["beginning", "progressing", "proficient"]);
const Status = z.enum(["draft", "published"]);

export const PreschoolProgressReportParamsModel = z.object({ id: z.uuid() });
export const PreschoolProgressReportChildParamsModel = z.object({
  childId: z.uuid(),
});

export const ListPreschoolProgressReportsRequestModel = z.object({
  classroomId: z.uuid(),
  term: Term,
  academicYearId: z
    .uuid()
    .optional()
    .describe("The Classroom's Academic Year by default."),
});

export const SavePreschoolProgressReportRequestModel = z.object({
  childId: z.uuid(),
  term: Term,
  academicYearId: z
    .uuid()
    .optional()
    .describe("The Academic Year of the Child's Admission by default."),
  ratings: z
    .array(
      z.object({
        domainId: z.uuid(),
        rating: Rating,
        remark: z.string().trim().max(500).nullish(),
      }),
    )
    .max(50),
  teacherRemarks: z.string().trim().max(4000).nullish(),
});

const TermModel = z.object({
  term: Term,
  label: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});

export const PreschoolClassroomProgressReportsModel = z.object({
  classroom: z.object({
    id: z.uuid(),
    name: z.string(),
    programmeName: z.string(),
    centreId: z.uuid(),
  }),
  academicYear: z.object({ id: z.uuid(), name: z.string() }),
  term: TermModel,
  counts: z.object({
    none: z.number().int(),
    draft: z.number().int(),
    published: z.number().int(),
  }),
  children: z.array(
    z.object({
      childId: z.uuid(),
      name: z.string(),
      photoUrl: z.string().nullable(),
      reportId: z.uuid().nullable(),
      status: z.enum(["none", "draft", "published"]),
      updatedAt: z.iso.datetime().nullable(),
    }),
  ),
});

export const PreschoolChildProgressReportsModel = z.object({
  childId: z.uuid(),
  name: z.string(),
  items: z.array(
    z.object({
      id: z.uuid(),
      academicYearId: z.uuid(),
      academicYearName: z.string(),
      term: TermModel,
      status: Status,
      publishedAt: z.iso.datetime().nullable(),
      updatedAt: z.iso.datetime(),
    }),
  ),
});

export const PreschoolProgressReportModel = z.object({
  id: z.uuid(),
  status: Status,
  term: TermModel,
  academicYear: z.object({ id: z.uuid(), name: z.string() }),
  centre: z.object({ id: z.uuid(), name: z.string() }),
  child: z.object({
    id: z.uuid(),
    name: z.string(),
    admissionNumber: z.string(),
    dateOfBirth: z.iso.date(),
    classroomName: z.string().nullable(),
    programmeName: z.string().nullable(),
  }),
  attendance: z.object({
    present: z.number().int(),
    marked: z.number().int(),
  }),
  ratings: z.array(
    z.object({
      domainId: z.uuid(),
      domainName: z.string(),
      description: z.string().nullable(),
      rating: Rating.nullable(),
      remark: z.string().nullable(),
    }),
  ),
  teacherRemarks: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
  observations: z
    .array(
      z.object({
        domainId: z.uuid(),
        items: z.array(
          z.object({
            id: z.uuid(),
            observedOn: z.iso.date(),
            note: z.string(),
            createdByName: z.string(),
          }),
        ),
      }),
    )
    .nullable(),
});
