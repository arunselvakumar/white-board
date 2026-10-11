import { z } from "zod";

import type {
  SiteDiaryActions,
  SiteDiaryDay,
  SiteDiaryDetail,
} from "@/src/site-work/application/site-diary-handlers";
import { SITE_DIARY_LIMITS, WEATHERS } from "@/src/site-work/domain/site-diary";

export const SITE_DIARY_PATH = "/api/construction/site-work/site-diary";

const weather = z.enum(WEATHERS);
/** `HH:MM`, 24-hour. */
const time = z.string().trim().max(5);

const SiteDiaryBody = z.object({
  /** `YYYY-MM-DD`, not after today; the back-dated limit applies. One diary per Project per date. */
  diaryDate: z.iso.date(),
  weatherMorning: weather.nullable().optional(),
  weatherAfternoon: weather.nullable().optional(),
  /** Rainfall in mm: ≥ 0, one decimal (a decimal string or a number). */
  rainfallMm: z
    .union([z.string().max(12), z.number().nonnegative()])
    .nullable()
    .optional(),
  siteCondition: z
    .string()
    .max(SITE_DIARY_LIMITS.siteCondition)
    .nullable()
    .optional(),
  notes: z.string().max(SITE_DIARY_LIMITS.notes).nullable().optional(),
  /** Replaced as a set on update. */
  visitors: z
    .array(
      z.object({
        name: z.string().max(SITE_DIARY_LIMITS.visitorName),
        organisation: z
          .string()
          .max(SITE_DIARY_LIMITS.organisation)
          .nullable()
          .optional(),
        purpose: z
          .string()
          .max(SITE_DIARY_LIMITS.purpose)
          .nullable()
          .optional(),
        timeIn: time.nullable().optional(),
        /** Not before `timeIn`. */
        timeOut: time.nullable().optional(),
      }),
    )
    .max(SITE_DIARY_LIMITS.visitors)
    .default([]),
  /** Replaced as a set on update. */
  instructions: z
    .array(
      z.object({
        givenBy: z.string().max(SITE_DIARY_LIMITS.person),
        givenTo: z.string().max(SITE_DIARY_LIMITS.person).nullable().optional(),
        instruction: z.string().max(SITE_DIARY_LIMITS.instruction),
        actionTaken: z
          .string()
          .max(SITE_DIARY_LIMITS.actionTaken)
          .nullable()
          .optional(),
      }),
    )
    .max(SITE_DIARY_LIMITS.instructions)
    .default([]),
});

export const CreateConstructionSiteWorkSiteDiaryRequestModel =
  SiteDiaryBody.extend({ projectId: z.uuid() });

export const UpdateConstructionSiteWorkSiteDiaryRequestModel =
  SiteDiaryBody.extend({
    /** The diary's `updatedAt` as last seen; 409 `SITE_DIARY_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DeleteConstructionSiteWorkSiteDiaryRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ConstructionSiteWorkSiteDiaryParamsModel = z.object({
  id: z.uuid(),
});

export const GetConstructionSiteWorkSiteDiaryByDateRequestModel = z.object({
  projectId: z.uuid(),
  date: z.iso.date(),
});

export const ListConstructionSiteWorkSiteDiariesRequestModel = z.object({
  projectId: z.uuid(),
  /** Diary dates `from`–`to`, at most a year. */
  from: z.iso.date(),
  to: z.iso.date(),
});

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });

export const ConstructionSiteWorkSiteDiaryActionsResponseModel = z.object({
  edit: z.boolean(),
  delete: z.boolean(),
  print: z.boolean(),
});

export const ConstructionSiteWorkSiteDiaryResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  diaryDate: z.iso.date(),
  weatherMorning: weather.nullable(),
  weatherAfternoon: weather.nullable(),
  /** mm, decimal string. */
  rainfallMm: z.string().nullable(),
  siteCondition: z.string().nullable(),
  notes: z.string().nullable(),
  visitors: z.array(
    z.object({
      name: z.string(),
      organisation: z.string().nullable(),
      purpose: z.string().nullable(),
      timeIn: z.string().nullable(),
      timeOut: z.string().nullable(),
    }),
  ),
  instructions: z.array(
    z.object({
      givenBy: z.string(),
      givenTo: z.string().nullable(),
      instruction: z.string(),
      actionTaken: z.string().nullable(),
    }),
  ),
  createdBy: person,
  updatedBy: person,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  actions: ConstructionSiteWorkSiteDiaryActionsResponseModel,
});
export type ConstructionSiteWorkSiteDiaryResponse = z.infer<
  typeof ConstructionSiteWorkSiteDiaryResponseModel
>;

export const GetConstructionSiteWorkSiteDiaryByDateResponseModel = z.object({
  date: z.iso.date(),
  /** Null when the Project has no diary for the date. */
  diary: ConstructionSiteWorkSiteDiaryResponseModel.nullable(),
});
export type GetConstructionSiteWorkSiteDiaryByDateResponse = z.infer<
  typeof GetConstructionSiteWorkSiteDiaryByDateResponseModel
>;

export const ListConstructionSiteWorkSiteDiariesResponseModel = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      diaryDate: z.iso.date(),
      weatherMorning: weather.nullable(),
      weatherAfternoon: weather.nullable(),
      rainfallMm: z.string().nullable(),
      visitorCount: z.number().int(),
      instructionCount: z.number().int(),
    }),
  ),
});
export type ListConstructionSiteWorkSiteDiariesResponse = z.infer<
  typeof ListConstructionSiteWorkSiteDiariesResponseModel
>;

export function toSiteDiaryResponse(
  diary: SiteDiaryDetail,
  actions: SiteDiaryActions,
): ConstructionSiteWorkSiteDiaryResponse {
  return {
    id: diary.id,
    projectId: diary.projectId,
    diaryDate: diary.diaryDate,
    weatherMorning: diary.weatherMorning,
    weatherAfternoon: diary.weatherAfternoon,
    rainfallMm: diary.rainfallMm,
    siteCondition: diary.siteCondition,
    notes: diary.notes,
    visitors: diary.visitors,
    instructions: diary.instructions,
    createdBy: { userId: diary.createdBy, name: diary.createdByName },
    updatedBy: { userId: diary.updatedBy, name: diary.updatedByName },
    createdAt: diary.createdAt.toISOString(),
    updatedAt: diary.updatedAt.toISOString(),
    actions,
  };
}

export function toSiteDiaryDays(
  days: readonly SiteDiaryDay[],
): ListConstructionSiteWorkSiteDiariesResponse {
  return { items: days.map((day) => ({ ...day })) };
}
