import { z } from "zod";

import type { LabourReadModel } from "@/src/labour/application/labour-ports";
import { financialValue, type MemberAccess } from "@/src/shared-kernel/access";
import { fileVersion } from "@/src/shared-kernel/files";

export const LABOURS_PATH = "/api/construction/labour/labours";

/** Paise: a whole number, signed only where it says so. */
const paise = z.int().describe("Paise (₹1 = 100).");
const calendarDate = z.iso.date().describe("Calendar date, YYYY-MM-DD.");
const ref = z.object({ id: z.uuid(), name: z.string() });

export const LabourIdParamsModel = z.object({ id: z.uuid() });

export const ConstructionLabourLabourResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  /** "Labour Id", typed by the Company. */
  labourCode: z.string().nullable(),
  fatherName: z.string().nullable(),
  joiningDate: calendarDate,
  wageType: z.enum(["daily", "monthly"]),
  /** Null without Financial, or for a monthly wage. */
  wagePerDay: paise.nullable(),
  /** Null without Financial, or for a daily wage. */
  wagePerMonth: paise.nullable(),
  /** Null without Financial. */
  overtimeWagePerHour: paise.nullable(),
  /** 0 = Sunday … 6 = Saturday. */
  weeklyHolidays: z.array(z.int().min(0).max(6)),
  /** Signed: negative is an advance given before the app. Null without Financial. */
  openingBalance: paise.nullable(),
  /** Owed to the labourer today (sum of the ledger). Null without Financial. */
  balance: paise.nullable(),
  uanNumber: z.string().nullable(),
  esicNumber: z.string().nullable(),
  /** `XXXXXXXX9012`; the number itself is never returned. */
  aadhaarMasked: z.string().nullable(),
  labourCategory: ref.nullable(),
  supervisor: ref.nullable(),
  /** E.164. */
  contactNumber: z.string().nullable(),
  gender: z.enum(["male", "female", "other"]).nullable(),
  currentProject: ref,
  isActive: z.boolean(),
  /** Same-origin URL of the photo (versioned), or null. */
  photoUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt` when updating. */
  updatedAt: z.iso.datetime(),
});

export type ConstructionLabourLabourResponseModel = z.infer<
  typeof ConstructionLabourLabourResponseModel
>;

export function toLabourResponse(
  item: LabourReadModel,
  access: MemberAccess,
): ConstructionLabourLabourResponseModel {
  const money = <T>(value: T) =>
    financialValue(access, "masters.labours", value);
  const { details } = item;
  return {
    id: item.id,
    name: details.name,
    labourCode: details.labourCode,
    fatherName: details.fatherName,
    joiningDate: details.joiningDate,
    wageType: details.wageType,
    wagePerDay: money(details.wagePerDay),
    wagePerMonth: money(details.wagePerMonth),
    overtimeWagePerHour: money(details.overtimeWagePerHour),
    weeklyHolidays: details.weeklyHolidays,
    openingBalance: money(item.openingBalance),
    balance: money(item.balance),
    uanNumber: details.uanNumber,
    esicNumber: details.esicNumber,
    aadhaarMasked: item.aadhaarMasked,
    labourCategory: item.labourCategory,
    supervisor: item.supervisor,
    contactNumber: details.contactNumber,
    gender: details.gender,
    currentProject: item.currentProject,
    isActive: item.isActive,
    photoUrl:
      item.photoKey == null
        ? null
        : `${LABOURS_PATH}/${item.id}/photo?v=${fileVersion(item.photoKey)}`,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

const optionalText = z.string().nullable().optional();

/** The fields Add and Edit share. */
const labourFields = {
  name: z.string(),
  labourCode: optionalText,
  fatherName: optionalText,
  joiningDate: z.string().describe("Calendar date, YYYY-MM-DD."),
  wageType: z.enum(["daily", "monthly"]),
  weeklyHolidays: z.array(z.int()).max(7).optional(),
  uanNumber: optionalText,
  esicNumber: optionalText,
  labourCategoryId: z.uuid().nullable().optional(),
  supervisorId: z.uuid().nullable().optional(),
  /** E.164, or a 10-digit Indian mobile. */
  contactNumber: optionalText,
  gender: z.enum(["male", "female", "other"]).nullable().optional(),
};

export const CreateConstructionLabourLabourRequestModel = z.object({
  ...labourFields,
  /** Required for a daily wage; paise. */
  wagePerDay: paise.nullable().optional(),
  /** Required for a monthly wage; paise. */
  wagePerMonth: paise.nullable().optional(),
  overtimeWagePerHour: paise,
  /** Signed paise; posted to the ledger on the joining date. */
  openingBalance: paise.nullable().optional(),
  /** 12 digits; stored encrypted. */
  aadhaar: optionalText,
  currentProjectId: z.uuid(),
});

export type CreateConstructionLabourLabourRequestModel = z.infer<
  typeof CreateConstructionLabourLabourRequestModel
>;

export const UpdateConstructionLabourLabourRequestModel = z.object({
  ...labourFields,
  /** Omit to keep the stored wage. */
  wagePerDay: paise.nullable().optional(),
  wagePerMonth: paise.nullable().optional(),
  overtimeWagePerHour: paise.nullable().optional(),
  /** Omit to keep; a new amount reverses the old opening entry and posts this one. */
  openingBalance: paise.nullable().optional(),
  /** Omit to keep the stored Aadhaar; null removes it. */
  aadhaar: optionalText,
  /** The `updatedAt` the edit started from; else 409 `LABOUR_CHANGED`. */
  expectedUpdatedAt: z.iso.datetime(),
});

export type UpdateConstructionLabourLabourRequestModel = z.infer<
  typeof UpdateConstructionLabourLabourRequestModel
>;

/** `true` or `false` in a query string. */
const booleanQuery = z.enum(["true", "false"]);

export function queryBoolean(value: "true" | "false" | undefined) {
  return value == null ? undefined : value === "true";
}

export const ListConstructionLabourLaboursRequestModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
    projectId: z.uuid().optional(),
    active: booleanQuery.optional(),
    q: z.string().trim().max(100).optional(),
    supervisorId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ExportConstructionLabourLaboursRequestModel = z.object({
  projectId: z.uuid().optional(),
  active: booleanQuery.optional(),
  q: z.string().trim().max(100).optional(),
  supervisorId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
});

export const ListConstructionLabourLaboursResponseModel = z.object({
  items: z.array(ConstructionLabourLabourResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int(),
});

export type ListConstructionLabourLaboursResponseModel = z.infer<
  typeof ListConstructionLabourLaboursResponseModel
>;

export const TransferConstructionLabourLaboursRequestModel = z.object({
  labourIds: z.array(z.uuid()).min(1).max(500),
  toProjectId: z.uuid(),
  /** The first day in the new Project. */
  transferDate: z.string().describe("Calendar date, YYYY-MM-DD."),
  remark: z.string().max(500).nullable().optional(),
});

export const TransferConstructionLabourLaboursResponseModel = z.object({
  items: z.array(ConstructionLabourLabourResponseModel),
});

export const ConstructionLabourLabourTransferResponseModel = z.object({
  id: z.uuid(),
  /** Null on the first row (added to the Project). */
  fromProject: ref.nullable(),
  toProject: ref,
  transferDate: calendarDate,
  remark: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const ListConstructionLabourLabourTransfersResponseModel = z.object({
  /** Oldest first. */
  items: z.array(ConstructionLabourLabourTransferResponseModel),
});

export type ListConstructionLabourLabourTransfersResponseModel = z.infer<
  typeof ListConstructionLabourLabourTransfersResponseModel
>;

export const ListConstructionLabourLabourOptionsRequestModel = z.object({
  projectId: z.uuid(),
  /** Defaults to today in the Company's time zone. */
  date: z.iso.date().optional(),
});

export const ConstructionLabourLabourOptionResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  labourCode: z.string().nullable(),
  labourCategoryId: z.uuid().nullable(),
  supervisorId: z.uuid().nullable(),
  wageType: z.enum(["daily", "monthly"]),
  weeklyHolidays: z.array(z.int()),
  /** Null without Financial on `labour.labour`. */
  wagePerDay: paise.nullable(),
  wagePerMonth: paise.nullable(),
  overtimeWagePerHour: paise.nullable(),
});

export const ListConstructionLabourLabourOptionsResponseModel = z.object({
  items: z.array(ConstructionLabourLabourOptionResponseModel),
});

export type ListConstructionLabourLabourOptionsResponseModel = z.infer<
  typeof ListConstructionLabourLabourOptionsResponseModel
>;

export const ImportConstructionLabourLaboursRequestModel = z.object({
  /** `true` (default) checks and previews; `false` imports when every row is valid. */
  dryRun: z.enum(["true", "false"]).optional(),
});

const importValues = z.object({
  name: z.string(),
  labourCode: z.string().nullable(),
  joiningDate: z.string().nullable(),
  wageType: z.string().nullable(),
  wagePerDay: paise.nullable(),
  wagePerMonth: paise.nullable(),
  overtimeWagePerHour: paise.nullable(),
  openingBalance: paise.nullable(),
  project: z.string().nullable(),
  labourCategory: z.string().nullable(),
  supervisor: z.string().nullable(),
});

export const ImportConstructionLabourLaboursResponseModel = z.object({
  rows: z.array(
    z.object({
      /** The Excel row number. */
      row: z.int(),
      ok: z.boolean(),
      errors: z.array(
        z.object({ field: z.string(), code: z.string(), message: z.string() }),
      ),
      values: importValues,
    }),
  ),
  valid: z.int(),
  invalid: z.int(),
  /** How many labourers were added (0 on a dry run). */
  imported: z.int(),
});

export type ImportConstructionLabourLaboursResponseModel = z.infer<
  typeof ImportConstructionLabourLaboursResponseModel
>;
