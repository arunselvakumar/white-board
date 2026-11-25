import { z } from "zod";

const Meal = z.enum(["breakfast", "snack", "lunch"]);
const Ate = z.enum(["all", "some", "none"]);
const ToiletKind = z.enum(["diaper_wet", "diaper_soiled", "potty", "toilet"]);
const Mood = z.enum(["happy", "calm", "tired", "fussy", "unwell"]);
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

export const PreschoolDailyReportChildParamsModel = z.object({
  childId: z.uuid(),
});

export const PreschoolDailyReportDayRequestModel = z.object({
  classroomId: z.uuid(),
  date: z.iso.date().optional(),
});

export const SavePreschoolDailyReportRequestModel = z.object({
  childId: z.uuid(),
  date: Day,
  meals: z
    .array(
      z.object({
        meal: Meal,
        menu: z.string().trim().max(200).nullish(),
        ate: Ate,
      }),
    )
    .max(3)
    .optional()
    .describe("Each meal at most once."),
  napFrom: Time.nullish(),
  napTo: Time.nullish().describe("With napFrom, and after it."),
  toilet: z
    .array(z.object({ time: Time, kind: ToiletKind }))
    .max(12)
    .optional(),
  mood: Mood.nullish(),
  activities: z.array(z.string().trim().max(120)).max(10).optional(),
  note: z.string().trim().max(2000).nullish(),
  photos: z
    .array(z.url({ protocol: /^https$/ }).max(2048))
    .max(6)
    .optional(),
});

export const ApplyPreschoolDailyReportToClassroomRequestModel = z.object({
  classroomId: z.uuid(),
  date: Day,
  meals: z
    .array(z.object({ meal: Meal, menu: z.string().trim().max(200).nullish() }))
    .max(3)
    .optional(),
  activities: z.array(z.string().trim().max(120)).max(10).optional(),
  childIds: z
    .array(z.uuid())
    .max(200)
    .optional()
    .describe(
      "Every Child marked present by default; the whole roster when nobody is marked.",
    ),
});

export const PublishPreschoolDailyReportsRequestModel = z.object({
  classroomId: z.uuid(),
  date: Day,
  childIds: z.array(z.uuid()).max(200).optional(),
});

export const PreschoolChildDailyReportsRequestModel = z.object({
  before: z.iso.date().optional().describe("Reports before this date."),
  limit: z.coerce.number().int().min(1).max(60).optional().default(14),
});

export const PreschoolDailyReportModel = z.object({
  id: z.uuid(),
  childId: z.uuid(),
  classroomId: z.uuid(),
  date: z.iso.date(),
  status: z.enum(["draft", "published"]),
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
  meals: z.array(
    z.object({ meal: Meal, menu: z.string().nullable(), ate: Ate }),
  ),
  napFrom: z.string().nullable(),
  napTo: z.string().nullable(),
  toilet: z.array(z.object({ time: z.string(), kind: ToiletKind })),
  mood: Mood.nullable(),
  activities: z.array(z.string()),
  note: z.string().nullable(),
  photos: z.array(z.string()),
});

export const PreschoolClassroomDailyReportsModel = z.object({
  classroom: z.object({
    id: z.uuid(),
    name: z.string(),
    programmeName: z.string(),
    centreId: z.uuid(),
  }),
  date: z.iso.date(),
  editable: z.boolean(),
  counts: z.object({
    drafts: z.number().int(),
    published: z.number().int(),
    none: z.number().int(),
  }),
  children: z.array(
    z.object({
      childId: z.uuid(),
      name: z.string(),
      photoUrl: z.string().nullable(),
      attendance: z.enum(["present", "absent", "leave"]).nullable(),
      report: PreschoolDailyReportModel.nullable(),
    }),
  ),
});

export const PublishPreschoolDailyReportsResponseModel = z.object({
  published: z.number().int(),
});

export const PreschoolChildDailyReportsModel = z.object({
  childId: z.uuid(),
  name: z.string(),
  items: z.array(PreschoolDailyReportModel),
  nextBefore: z.iso.date().nullable(),
});
