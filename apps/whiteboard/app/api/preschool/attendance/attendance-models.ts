import { z } from "zod";

const Status = z.enum(["present", "absent", "leave"]);
const CollectedByKind = z.enum([
  "father",
  "mother",
  "authorised_pickup",
  "other",
]);
const Time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe("HH:mm in India.");
const Day = z.iso
  .date()
  .optional()
  .describe(
    "Today in India by default. Never ahead; a Teacher only today and yesterday.",
  );
const Month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .describe("YYYY-MM.");

export const PreschoolAttendanceChildParamsModel = z.object({
  childId: z.uuid(),
});

export const PreschoolAttendanceDayRequestModel = z.object({
  classroomId: z.uuid(),
  date: z.iso.date().optional(),
});

export const MarkPreschoolAttendanceRequestModel = z.object({
  classroomId: z.uuid(),
  date: Day,
  marks: z
    .array(z.object({ childId: z.uuid(), status: Status }))
    .min(1)
    .max(200),
});

export const PreschoolCheckInRequestModel = z.object({
  childId: z.uuid(),
  date: Day,
  time: Time.optional().describe("Now by default; needed for a past day."),
  droppedBy: z.string().trim().max(200).nullish(),
});

export const PreschoolCheckOutRequestModel = z.object({
  childId: z.uuid(),
  date: Day,
  time: Time.optional().describe("Now by default; needed for a past day."),
  collectedByKind: CollectedByKind,
  pickupId: z
    .uuid()
    .nullish()
    .describe("One of the Child's Authorised Pickups, for authorised_pickup."),
  collectedByName: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .describe("Required for other; a Parent's name comes from the record."),
  note: z.string().trim().max(500).nullish().describe("Required for other."),
});

export const PreschoolAttendanceChildDayRequestModel = z.object({
  childId: z.uuid(),
  date: Day,
});

export const PreschoolAttendanceMonthRequestModel = z.object({
  classroomId: z.uuid(),
  month: Month,
});

export const PreschoolAttendanceSummaryRequestModel = z.object({
  centreId: z.uuid(),
  date: z.iso.date().optional(),
});

export const PreschoolChildAttendanceMonthRequestModel = z.object({
  month: Month,
});

const MarkModel = z.object({
  status: Status,
  checkInTime: z.string().nullable(),
  droppedBy: z.string().nullable(),
  checkOutTime: z.string().nullable(),
  collectedBy: z
    .object({
      kind: CollectedByKind,
      name: z.string(),
      pickupId: z.uuid().nullable(),
    })
    .nullable(),
  note: z.string().nullable(),
});

const ClassroomModel = z.object({
  id: z.uuid(),
  name: z.string(),
  programmeName: z.string(),
  centreId: z.uuid(),
});

const CountsModel = z.object({
  rosterSize: z.number().int(),
  present: z.number().int(),
  absent: z.number().int(),
  leave: z.number().int(),
  notMarked: z.number().int(),
  checkedOut: z.number().int(),
});

const TotalsModel = z.object({
  present: z.number().int(),
  absent: z.number().int(),
  leave: z.number().int(),
});

const Person = z.object({
  name: z.string().nullable(),
  phone: z.string().nullable(),
});

export const PreschoolClassroomAttendanceModel = z.object({
  classroom: ClassroomModel,
  date: z.iso.date(),
  editable: z.boolean(),
  counts: CountsModel,
  children: z.array(
    z.object({
      childId: z.uuid(),
      name: z.string(),
      photoUrl: z.string().nullable(),
      hasAllergies: z.boolean(),
      father: Person,
      mother: Person,
      authorisedPickups: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          relationship: z.string(),
          photoUrl: z.string().nullable(),
        }),
      ),
      mark: MarkModel.nullable(),
    }),
  ),
});

export const PreschoolChildAttendanceDayModel = z.object({
  childId: z.uuid(),
  date: z.iso.date(),
  mark: MarkModel.nullable(),
});

export const PreschoolClassroomAttendanceMonthModel = z.object({
  classroom: ClassroomModel,
  month: z.string(),
  days: z.array(z.iso.date()),
  workingDays: z.number().int(),
  children: z.array(
    z.object({
      childId: z.uuid(),
      name: z.string(),
      days: z.array(Status.nullable()),
      totals: TotalsModel,
    }),
  ),
});

export const PreschoolCentreAttendanceSummaryModel = z.object({
  centreId: z.uuid(),
  date: z.iso.date(),
  classrooms: z.array(
    CountsModel.extend({ classroomId: z.uuid(), name: z.string() }),
  ),
  totals: CountsModel,
});

export const PreschoolChildAttendanceMonthModel = z.object({
  childId: z.uuid(),
  name: z.string(),
  month: z.string(),
  days: z.array(
    z.object({
      date: z.iso.date(),
      status: Status.nullable(),
      checkInTime: z.string().nullable(),
      checkOutTime: z.string().nullable(),
      collectedByName: z.string().nullable(),
      collectedByKind: CollectedByKind.nullable(),
    }),
  ),
  totals: TotalsModel,
});
