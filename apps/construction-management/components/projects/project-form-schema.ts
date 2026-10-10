import { formatMobile, normalizeMobile } from "@repo/auth/construction/mobile";
import type { FieldPath } from "react-hook-form";
import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  PROJECT_BUDGET_MAX,
  PROJECT_CLIENT_NAME_MAX,
  PROJECT_CUSTOM_FIELD_LABEL_MAX,
  PROJECT_CUSTOM_FIELD_VALUE_MAX,
  PROJECT_CUSTOM_FIELDS_MAX,
  PROJECT_DATE_FIELDS,
  PROJECT_ORDER_VALUE_MAX,
  PROJECT_REFERENCE_FIELDS,
  PROJECT_REFERENCE_MAX,
} from "@/src/projects/domain/project-contract-rules";
import {
  isProjectType,
  type ProjectType,
} from "@/src/projects/domain/project-type";
import { QueryHttpError } from "@/src/queries/http";
import type {
  ProjectInput,
  ProjectResponse,
  ProjectStatus,
} from "@/src/queries/projects";
import { isCalendarDate } from "@/src/shared-kernel/calendar-date";
import { isGstStateCode } from "@/src/shared-kernel/gst-states";

import { groupRupees, PROJECT_PAPERS } from "./project-contract";
import { PROJECT_STATUS_ORDER } from "./project-status";

const dateField = z
  .string()
  .refine((value) => value === "" || isCalendarDate(value), {
    message: "Enter a date",
  });

const reference = z
  .string()
  .trim()
  .max(
    PROJECT_REFERENCE_MAX,
    `Use at most ${String(PROJECT_REFERENCE_MAX)} characters`,
  );

/** A Project's mobile is Indian (`+91`), as the server requires. */
function isClientMobile(value: string): boolean {
  return normalizeMobile(value)?.startsWith("+91") ?? false;
}

/** Blank, or rupees up to `max` paise. */
const isAmountUpTo = (max: number) => (value: string) => {
  if (value.trim() === "") return true;
  if (!isRupees(value)) return false;
  const paise = rupeesToPaise(value);
  return paise != null && paise <= max;
};

const isOrderValue = isAmountUpTo(PROJECT_ORDER_VALUE_MAX);
const isBudget = isAmountUpTo(PROJECT_BUDGET_MAX);

const customField = z.object({ label: z.string(), value: z.string() });

export const projectFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the Project name")
      .max(120, "Use at most 120 characters"),
    status: z.enum(PROJECT_STATUS_ORDER),
    /** "" until chosen; required on Add Project (`newProjectFormSchema`). */
    projectType: z
      .string()
      .refine((value): boolean => value === "" || isProjectType(value), {
        message: "Choose the Project Type",
      }),
    budgetValue: z.string().refine(isBudget, {
      message: "Enter the amount in rupees, like 3,20,00,000",
    }),
    useLogoInReports: z.boolean(),
    /** GST state code, or "" for Not set (CM-501). */
    stateCode: z
      .string()
      .refine((value): boolean => value === "" || isGstStateCode(value), {
        message: "Choose a state from the list",
      }),
    address: z.string().trim().max(500, "Use at most 500 characters"),
    startDate: dateField,
    endDate: dateField,
    clientName: z
      .string()
      .trim()
      .max(
        PROJECT_CLIENT_NAME_MAX,
        `Use at most ${String(PROJECT_CLIENT_NAME_MAX)} characters`,
      ),
    clientPhone: z
      .string()
      .trim()
      .refine((value) => value === "" || isClientMobile(value), {
        message: "Enter a 10-digit mobile number, like 98431 22110",
      }),
    orderValue: z.string().refine(isOrderValue, {
      message: "Enter the amount in rupees, like 1,84,50,000",
    }),
    tenderRef: reference,
    quotationNo: reference,
    quotationDate: dateField,
    loaNo: reference,
    loaDate: dateField,
    clientOrderNo: reference,
    clientOrderDate: dateField,
    agreementNo: reference,
    agreementDate: dateField,
    customFields: z.array(customField),
  })
  .superRefine((values, ctx) => {
    if (
      values.startDate !== "" &&
      values.endDate !== "" &&
      values.endDate < values.startDate
    )
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date cannot be before the start date",
      });

    const seen = new Set<string>();
    let filled = 0;
    values.customFields.forEach((row, index) => {
      const label = row.label.trim();
      const value = row.value.trim();
      if (label === "" && value === "") return;
      filled += 1;
      const at = (field: "label" | "value", message: string) => {
        ctx.addIssue({
          code: "custom",
          path: ["customFields", index, field],
          message,
        });
      };
      if (label === "") at("label", "Name this field");
      else if (label.length > PROJECT_CUSTOM_FIELD_LABEL_MAX)
        at(
          "label",
          `Use at most ${String(PROJECT_CUSTOM_FIELD_LABEL_MAX)} characters`,
        );
      else if (seen.has(label.toLowerCase()))
        at("label", `"${label}" is already a field on this Project`);
      seen.add(label.toLowerCase());
      if (value === "") at("value", "Enter a value, or remove this field");
      else if (value.length > PROJECT_CUSTOM_FIELD_VALUE_MAX)
        at(
          "value",
          `Use at most ${String(PROJECT_CUSTOM_FIELD_VALUE_MAX)} characters`,
        );
    });
    if (filled > PROJECT_CUSTOM_FIELDS_MAX)
      ctx.addIssue({
        code: "custom",
        path: ["customFields"],
        message: `A Project can have at most ${String(PROJECT_CUSTOM_FIELDS_MAX)} fields`,
      });
  });

/**
 * Add Project needs a Project Type (CM-401). Edit does not: a Project from
 * before M4 may stay "Not set", and the select cannot clear a type.
 */
export const newProjectFormSchema = projectFormSchema.superRefine(
  (values, ctx) => {
    if (values.projectType === "")
      ctx.addIssue({
        code: "custom",
        path: ["projectType"],
        message: "Choose the Project Type",
      });
  },
);

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
export type ProjectFormField = FieldPath<ProjectFormValues>;

/** Which card a field sits in; the Project card is always open. */
export type ProjectFormCard = "project" | "client" | "contract" | "more";

export function cardOf(field: string): ProjectFormCard {
  if (field === "clientName" || field === "clientPhone") return "client";
  if (field.startsWith("customFields")) return "more";
  if (
    field === "orderValue" ||
    (PROJECT_REFERENCE_FIELDS as readonly string[]).includes(field) ||
    (PROJECT_DATE_FIELDS as readonly string[]).includes(field)
  )
    return "contract";
  return "project";
}

/** Fields in the order they appear on screen, for "focus the first error". */
export const FIELD_ORDER: readonly string[] = [
  "name",
  "projectType",
  "status",
  "startDate",
  "endDate",
  "budgetValue",
  "stateCode",
  "address",
  "clientName",
  "clientPhone",
  "orderValue",
  ...PROJECT_PAPERS.flatMap((paper) =>
    paper.dateField == null
      ? [paper.numberField]
      : [paper.numberField, paper.dateField],
  ),
];

/** A mobile in the form: national digits, `98431 22110`. */
function phoneForInput(phone: string | null): string {
  if (phone == null) return "";
  return formatMobile(phone).replace(/^\+91 /, "");
}

export function projectFormValues(
  project: ProjectResponse | null,
): ProjectFormValues {
  return {
    name: project?.name ?? "",
    status: project?.status ?? "ongoing",
    projectType: project?.projectType ?? "",
    budgetValue: groupRupees(paiseToRupees(project?.budgetValue)),
    useLogoInReports: project?.useLogoInReports ?? false,
    stateCode: project?.stateCode ?? "",
    address: project?.address ?? "",
    startDate: project?.startDate ?? "",
    endDate: project?.endDate ?? "",
    clientName: project?.clientName ?? "",
    clientPhone: phoneForInput(project?.clientPhone ?? null),
    orderValue: groupRupees(paiseToRupees(project?.orderValue)),
    tenderRef: project?.tenderRef ?? "",
    quotationNo: project?.quotationNo ?? "",
    quotationDate: project?.quotationDate ?? "",
    loaNo: project?.loaNo ?? "",
    loaDate: project?.loaDate ?? "",
    clientOrderNo: project?.clientOrderNo ?? "",
    clientOrderDate: project?.clientOrderDate ?? "",
    agreementNo: project?.agreementNo ?? "",
    agreementDate: project?.agreementDate ?? "",
    customFields: project?.customFields.map((row) => ({ ...row })) ?? [],
  };
}

const blankToNull = (value: string): string | null => {
  const text = value.trim();
  return text === "" ? null : text;
};

export type ProjectFormInput = ProjectInput & { status: ProjectStatus };

/**
 * The request body, plus where each sent custom field sat on the form
 * (fully blank rows are dropped, so a server `details.index` maps back).
 *
 * Order value and budget: only a viewer with the Project menu's Financial
 * flag sends them (`financial`, from the Projects list); the server would
 * ignore them anyway. A value that came back null and is still blank is
 * left out of the request instead of being sent as a clear. A Project
 * Type left blank (a Project from before M4) is left out, so it stays
 * "Not set". So is a State still "Not set"; one taken away is sent as null.
 */
export function projectFormInput(
  values: ProjectFormValues,
  project: ProjectResponse | null,
  financial: boolean,
): { input: ProjectFormInput; customFieldRows: number[] } {
  const customFieldRows: number[] = [];
  const customFields: { label: string; value: string }[] = [];
  values.customFields.forEach((row, index) => {
    const label = row.label.trim();
    const value = row.value.trim();
    if (label === "" && value === "") return;
    customFieldRows.push(index);
    customFields.push({ label, value });
  });

  const orderValue = rupeesToPaise(values.orderValue);
  const sendOrderValue =
    financial && (orderValue != null || project?.orderValue != null);
  const budgetValue = rupeesToPaise(values.budgetValue);
  const sendBudget =
    financial && (budgetValue != null || project?.budgetValue != null);
  const sendState = values.stateCode !== "" || project?.stateCode != null;

  const input: ProjectFormInput = {
    name: values.name,
    status: values.status,
    ...(values.projectType === ""
      ? {}
      : { projectType: values.projectType as ProjectType }),
    useLogoInReports: values.useLogoInReports,
    ...(sendState
      ? { stateCode: values.stateCode === "" ? null : values.stateCode }
      : {}),
    address: blankToNull(values.address),
    startDate: blankToNull(values.startDate),
    endDate: blankToNull(values.endDate),
    clientName: blankToNull(values.clientName),
    clientPhone:
      values.clientPhone.trim() === ""
        ? null
        : normalizeMobile(values.clientPhone),
    tenderRef: blankToNull(values.tenderRef),
    quotationNo: blankToNull(values.quotationNo),
    quotationDate: blankToNull(values.quotationDate),
    loaNo: blankToNull(values.loaNo),
    loaDate: blankToNull(values.loaDate),
    clientOrderNo: blankToNull(values.clientOrderNo),
    clientOrderDate: blankToNull(values.clientOrderDate),
    agreementNo: blankToNull(values.agreementNo),
    agreementDate: blankToNull(values.agreementDate),
    ...(sendOrderValue ? { orderValue } : {}),
    ...(sendBudget ? { budgetValue } : {}),
    customFields,
  };
  return { input, customFieldRows };
}

const SERVER_FIELDS: Record<string, ProjectFormField> = {
  PROJECT_NAME_REQUIRED: "name",
  PROJECT_NAME_TOO_LONG: "name",
  PROJECT_NAME_IN_USE: "name",
  PROJECT_STATUS_INVALID: "status",
  PROJECT_TYPE_REQUIRED: "projectType",
  PROJECT_TYPE_INVALID: "projectType",
  PROJECT_BUDGET_INVALID: "budgetValue",
  PROJECT_STATE_INVALID: "stateCode",
  PROJECT_ADDRESS_TOO_LONG: "address",
  PROJECT_DATE_INVALID: "startDate",
  PROJECT_DATES_INVALID: "endDate",
  PROJECT_CLIENT_NAME_TOO_LONG: "clientName",
  PROJECT_CLIENT_PHONE_INVALID: "clientPhone",
  PROJECT_ORDER_VALUE_INVALID: "orderValue",
};

const CUSTOM_FIELD_CODES: Record<string, "label" | "value"> = {
  PROJECT_CUSTOM_FIELD_LABEL_REQUIRED: "label",
  PROJECT_CUSTOM_FIELD_VALUE_REQUIRED: "value",
  PROJECT_CUSTOM_FIELD_DUPLICATE: "label",
  PROJECT_CUSTOM_FIELD_TOO_LONG: "label",
};

function detail(details: unknown, key: string): unknown {
  return typeof details === "object" && details !== null && key in details
    ? (details as Record<string, unknown>)[key]
    : undefined;
}

/**
 * The form field a server error is about, or null for a form-level
 * message. `details.field` names a contract field; `details.index` is a
 * custom field's place in the list as sent (`customFieldRows` maps it back).
 */
export function serverField(
  error: unknown,
  customFieldRows: readonly number[],
): ProjectFormField | null {
  if (!(error instanceof QueryHttpError)) return null;
  const field = detail(error.details, "field");
  const index = detail(error.details, "index");

  const part = CUSTOM_FIELD_CODES[error.code];
  if (part != null) {
    if (typeof index !== "number") return null;
    const row = customFieldRows[index];
    if (row == null) return null;
    const which = field === "value" ? "value" : part;
    return `customFields.${row}.${which}` as const;
  }
  if (
    (error.code === "PROJECT_REFERENCE_TOO_LONG" ||
      error.code === "PROJECT_DATE_INVALID") &&
    typeof field === "string" &&
    ([...PROJECT_REFERENCE_FIELDS, ...PROJECT_DATE_FIELDS] as string[])
      .concat(["startDate", "endDate"])
      .includes(field)
  )
    return field as ProjectFormField;
  return SERVER_FIELDS[error.code] ?? null;
}
