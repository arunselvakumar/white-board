import { normalizeMobile } from "@repo/auth/construction/react";
import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  LABOUR_WAGE,
  checkWage,
  wageDefaults,
  wageErrorFields,
  wagePayload,
  wageValuesSchema,
  type WageValues,
} from "@/components/wages/wage-schema";
import type {
  LabourInput,
  LabourResponse,
  LabourUpdateInput,
} from "@/src/queries/labours";
import { isValidAadhaar } from "@/src/shared-kernel/tax-ids";

const baseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Labour's name")
    .max(100, "Use at most 100 characters"),
  labourCode: z.string().trim().max(30, "Use at most 30 characters"),
  fatherName: z.string().trim().max(100, "Use at most 100 characters"),
  joiningDate: z.string().min(1, "Enter the joining date"),
  /** The wage set-up shared with Staff (`components/wages`). */
  wage: wageValuesSchema,
  openingBalance: z.string(),
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
  /** None, one or many; not required (ADR CM-0033). */
  projectIds: z.array(z.string()),
});

export type LabourFormValues = z.infer<typeof baseSchema>;

/**
 * Client checks; the server repeats every rule (`modules/08`). Without
 * Financial the amounts are neither shown nor sent, so they keep their
 * stored values.
 */
export function labourFormSchema(options: { showAmounts: boolean }) {
  return baseSchema.superRefine((values, ctx) => {
    checkWage(values.wage, ctx, {
      ...LABOUR_WAGE,
      path: ["wage"],
      showAmounts: options.showAmounts,
    });
    if (!options.showAmounts) return;
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
      wage: wageDefaults(null, LABOUR_WAGE),
      openingBalance: "",
      uanNumber: "",
      esicNumber: "",
      aadhaar: "",
      labourCategoryId: "",
      supervisorId: "",
      contactNumber: "",
      gender: "",
      projectIds: [],
    };
  return {
    name: labour.name,
    labourCode: labour.labourCode ?? "",
    fatherName: labour.fatherName ?? "",
    joiningDate: labour.joiningDate,
    wage: wageDefaults(
      {
        type: labour.wageType,
        perDay: labour.wagePerDay,
        perMonth: labour.wagePerMonth,
        overtimePerHour: labour.overtimeWagePerHour,
        workingHoursPerDay: labour.workingHoursPerDay,
        weeklyHolidays: labour.weeklyHolidays,
      },
      LABOUR_WAGE,
    ),
    openingBalance: paiseToRupees(labour.openingBalance),
    uanNumber: labour.uanNumber ?? "",
    esicNumber: labour.esicNumber ?? "",
    aadhaar: "",
    labourCategoryId: labour.labourCategory?.id ?? "",
    supervisorId: labour.supervisor?.id ?? "",
    contactNumber: labour.contactNumber?.replace(/^\+91/, "") ?? "",
    gender: labour.gender ?? "",
    projectIds: labour.projects.map((project) => project.id),
  };
}

const blank = (value: string) => (value.trim() === "" ? null : value.trim());

function details(values: LabourFormValues) {
  const wage = wagePayload(values.wage);
  return {
    name: values.name.trim(),
    labourCode: blank(values.labourCode),
    fatherName: blank(values.fatherName),
    joiningDate: values.joiningDate,
    wageType: wage.type,
    weeklyHolidays: wage.weeklyHolidays,
    workingHoursPerDay: wage.workingHoursPerDay,
    uanNumber: blank(values.uanNumber),
    esicNumber: blank(values.esicNumber),
    labourCategoryId: blank(values.labourCategoryId),
    supervisorId: blank(values.supervisorId),
    contactNumber:
      values.contactNumber.trim() === ""
        ? null
        : normalizeMobile(values.contactNumber),
    gender: values.gender === "" ? null : values.gender,
    projectIds: values.projectIds,
  };
}

function amounts(values: LabourFormValues) {
  const wage = wagePayload(values.wage);
  return {
    wagePerDay: wage.perDay,
    wagePerMonth: wage.perMonth,
    overtimeWagePerHour: wage.overtimePerHour,
    openingBalance: rupeesToPaise(values.openingBalance) ?? 0,
  };
}

/** The Add Labour request body (rupees → paise). */
export function createLabourPayload(values: LabourFormValues): LabourInput {
  return {
    ...details(values),
    ...amounts(values),
    aadhaar: blank(values.aadhaar),
  };
}

/**
 * The Edit request body. A blank Aadhaar keeps the stored one; without
 * Financial the amounts are left out and kept. The Projects are sent in
 * full: those ticked or unticked are on or off from today.
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

type LabourField =
  Exclude<keyof LabourFormValues, "wage"> | `wage.${keyof WageValues}`;

/** Server error codes → the field they belong to. */
export const LABOUR_ERROR_FIELDS: Record<string, LabourField> = {
  LABOUR_NAME_REQUIRED: "name",
  LABOUR_NAME_TOO_LONG: "name",
  LABOUR_CODE_TOO_LONG: "labourCode",
  LABOUR_CODE_TAKEN: "labourCode",
  FATHER_NAME_TOO_LONG: "fatherName",
  JOINING_DATE_INVALID: "joiningDate",
  JOINING_DATE_AFTER_TRANSFER: "joiningDate",
  JOINING_DATE_AFTER_ATTENDANCE: "joiningDate",
  OPENING_BALANCE_INVALID: "openingBalance",
  UAN_INVALID: "uanNumber",
  ESIC_INVALID: "esicNumber",
  AADHAAR_INVALID: "aadhaar",
  MOBILE_INVALID: "contactNumber",
  GENDER_INVALID: "gender",
  LABOUR_CATEGORY_NOT_FOUND: "labourCategoryId",
  SUPERVISOR_NOT_FOUND: "supervisorId",
  PROJECT_NOT_FOUND: "projectIds",
};

/** The field for a wage error depends on the wage type being saved. */
export function labourErrorFields(
  values: LabourFormValues,
): Record<string, LabourField> {
  return { ...LABOUR_ERROR_FIELDS, ...wageErrorFields("wage", values.wage) };
}
