import { normalizeMobile } from "@repo/auth/construction/react";
import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import type {
  LabourInput,
  LabourResponse,
  LabourUpdateInput,
} from "@/src/queries/labours";
import { isValidAadhaar } from "@/src/shared-kernel/tax-ids";

export const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

const baseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the labourer's name")
    .max(100, "Use at most 100 characters"),
  labourCode: z.string().trim().max(30, "Use at most 30 characters"),
  fatherName: z.string().trim().max(100, "Use at most 100 characters"),
  joiningDate: z.string().min(1, "Enter the joining date"),
  wageType: z.enum(["daily", "monthly"]),
  /** Rupees as typed. */
  wagePerDay: z.string(),
  wagePerMonth: z.string(),
  overtimeWagePerHour: z.string(),
  openingBalance: z.string(),
  weeklyHolidays: z.array(z.number()),
  uanNumber: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{12}$/.test(value.replace(/\s/g, "")),
      {
        message: "The UAN is 12 digits",
      },
    ),
  esicNumber: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" || /^(\d{10}|\d{17})$/.test(value.replace(/\s/g, "")),
      { message: "The ESIC number is 10 or 17 digits" },
    ),
  aadhaar: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidAadhaar(value), {
      message: "Enter a valid 12-digit Aadhaar number",
    }),
  labourCategoryId: z.string(),
  supervisorId: z.string(),
  contactNumber: z
    .string()
    .trim()
    .refine((value) => value === "" || normalizeMobile(value) != null, {
      message: "Enter a valid 10-digit mobile number",
    }),
  gender: z.enum(["", "male", "female", "other"]),
  currentProjectId: z.string(),
});

export type LabourFormValues = z.infer<typeof baseSchema>;

/**
 * Client checks; the server repeats every rule (`modules/08`). Without
 * Financial the amounts are neither shown nor sent, so they keep their
 * stored values.
 */
export function labourFormSchema(options: {
  showAmounts: boolean;
  isNew: boolean;
}) {
  return baseSchema.superRefine((values, ctx) => {
    if (options.isNew && values.currentProjectId === "")
      ctx.addIssue({
        code: "custom",
        path: ["currentProjectId"],
        message: "Choose the Project",
      });
    if (!options.showAmounts) return;
    const wageField =
      values.wageType === "daily" ? "wagePerDay" : "wagePerMonth";
    const wage = values[wageField].trim();
    if (wage === "" || rupeesToPaise(wage) === 0)
      ctx.addIssue({
        code: "custom",
        path: [wageField],
        message:
          values.wageType === "daily"
            ? "Enter the wage per day"
            : "Enter the wage per month",
      });
    else if (!isRupees(wage))
      ctx.addIssue({
        code: "custom",
        path: [wageField],
        message: "Enter an amount in rupees, like 700 or 700.50",
      });
    if (!isRupees(values.overtimeWagePerHour))
      ctx.addIssue({
        code: "custom",
        path: ["overtimeWagePerHour"],
        message: "Enter the overtime wage per hour (0 if none)",
      });
    if (
      values.openingBalance.trim() !== "" &&
      !isRupees(values.openingBalance, true)
    )
      ctx.addIssue({
        code: "custom",
        path: ["openingBalance"],
        message: "Enter an amount in rupees, like 2500 or -1000",
      });
  });
}

export function labourFormDefaults(
  labour: LabourResponse | null,
): LabourFormValues {
  if (labour == null)
    return {
      name: "",
      labourCode: "",
      fatherName: "",
      joiningDate: "",
      wageType: "daily",
      wagePerDay: "",
      wagePerMonth: "",
      overtimeWagePerHour: "0",
      openingBalance: "",
      weeklyHolidays: [0],
      uanNumber: "",
      esicNumber: "",
      aadhaar: "",
      labourCategoryId: "",
      supervisorId: "",
      contactNumber: "",
      gender: "",
      currentProjectId: "",
    };
  return {
    name: labour.name,
    labourCode: labour.labourCode ?? "",
    fatherName: labour.fatherName ?? "",
    joiningDate: labour.joiningDate,
    wageType: labour.wageType,
    wagePerDay: paiseToRupees(labour.wagePerDay),
    wagePerMonth: paiseToRupees(labour.wagePerMonth),
    overtimeWagePerHour: paiseToRupees(labour.overtimeWagePerHour),
    openingBalance: paiseToRupees(labour.openingBalance),
    weeklyHolidays: labour.weeklyHolidays,
    uanNumber: labour.uanNumber ?? "",
    esicNumber: labour.esicNumber ?? "",
    aadhaar: "",
    labourCategoryId: labour.labourCategory?.id ?? "",
    supervisorId: labour.supervisor?.id ?? "",
    contactNumber: labour.contactNumber?.replace(/^\+91/, "") ?? "",
    gender: labour.gender ?? "",
    currentProjectId: labour.currentProject.id,
  };
}

const blank = (value: string) => (value.trim() === "" ? null : value.trim());

function details(values: LabourFormValues) {
  return {
    name: values.name.trim(),
    labourCode: blank(values.labourCode),
    fatherName: blank(values.fatherName),
    joiningDate: values.joiningDate,
    wageType: values.wageType,
    weeklyHolidays: [...values.weeklyHolidays].sort((a, b) => a - b),
    uanNumber: blank(values.uanNumber),
    esicNumber: blank(values.esicNumber),
    labourCategoryId: blank(values.labourCategoryId),
    supervisorId: blank(values.supervisorId),
    contactNumber:
      values.contactNumber.trim() === ""
        ? null
        : normalizeMobile(values.contactNumber),
    gender: values.gender === "" ? null : values.gender,
  };
}

function amounts(values: LabourFormValues) {
  return {
    wagePerDay:
      values.wageType === "daily" ? rupeesToPaise(values.wagePerDay) : null,
    wagePerMonth:
      values.wageType === "monthly" ? rupeesToPaise(values.wagePerMonth) : null,
    overtimeWagePerHour: rupeesToPaise(values.overtimeWagePerHour) ?? 0,
    openingBalance: rupeesToPaise(values.openingBalance) ?? 0,
  };
}

/** The Add Labour request body (rupees → paise). */
export function createLabourPayload(values: LabourFormValues): LabourInput {
  return {
    ...details(values),
    ...amounts(values),
    aadhaar: blank(values.aadhaar),
    currentProjectId: values.currentProjectId,
  };
}

/**
 * The Edit request body. A blank Aadhaar keeps the stored one; without
 * Financial the amounts are left out and kept.
 */
export function updateLabourPayload(
  values: LabourFormValues,
  options: { showAmounts: boolean; expectedUpdatedAt: string },
): LabourUpdateInput {
  return {
    ...details(values),
    ...(options.showAmounts ? amounts(values) : {}),
    ...(values.aadhaar.trim() === "" ? {} : { aadhaar: values.aadhaar.trim() }),
    expectedUpdatedAt: options.expectedUpdatedAt,
  };
}

/** Server error codes → the field they belong to. */
export const LABOUR_ERROR_FIELDS: Record<string, keyof LabourFormValues> = {
  LABOUR_NAME_REQUIRED: "name",
  LABOUR_NAME_TOO_LONG: "name",
  LABOUR_CODE_TOO_LONG: "labourCode",
  LABOUR_CODE_TAKEN: "labourCode",
  FATHER_NAME_TOO_LONG: "fatherName",
  JOINING_DATE_INVALID: "joiningDate",
  JOINING_DATE_AFTER_TRANSFER: "joiningDate",
  JOINING_DATE_AFTER_ATTENDANCE: "joiningDate",
  WAGE_TYPE_INVALID: "wageType",
  OVERTIME_WAGE_REQUIRED: "overtimeWagePerHour",
  OVERTIME_WAGE_INVALID: "overtimeWagePerHour",
  OPENING_BALANCE_INVALID: "openingBalance",
  WEEKLY_HOLIDAYS_INVALID: "weeklyHolidays",
  UAN_INVALID: "uanNumber",
  ESIC_INVALID: "esicNumber",
  AADHAAR_INVALID: "aadhaar",
  MOBILE_INVALID: "contactNumber",
  GENDER_INVALID: "gender",
  LABOUR_CATEGORY_NOT_FOUND: "labourCategoryId",
  SUPERVISOR_NOT_FOUND: "supervisorId",
  PROJECT_NOT_FOUND: "currentProjectId",
  PROJECT_REQUIRED: "currentProjectId",
};

/** The field for a wage error depends on the wage type being saved. */
export function labourErrorFields(
  values: LabourFormValues,
): Record<string, keyof LabourFormValues> {
  const wage = values.wageType === "daily" ? "wagePerDay" : "wagePerMonth";
  return { ...LABOUR_ERROR_FIELDS, WAGE_REQUIRED: wage, WAGE_INVALID: wage };
}
