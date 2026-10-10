import { z } from "zod";

import type { ProjectReadModel } from "@/src/projects/application/project-read-model";
import { PROJECT_STATUSES } from "@/src/projects/domain/project";
import {
  PROJECT_TYPE_KEYS,
  PROJECT_TYPES,
} from "@/src/projects/domain/project-type";
import { fileVersion } from "@/src/shared-kernel/files";
import { gstStateName } from "@/src/shared-kernel/gst-states";
import {
  PROJECT_BUDGET_MAX,
  PROJECT_CLIENT_NAME_MAX,
  PROJECT_CUSTOM_FIELD_LABEL_MAX,
  PROJECT_CUSTOM_FIELD_VALUE_MAX,
  PROJECT_CUSTOM_FIELDS_MAX,
  PROJECT_ORDER_VALUE_MAX,
  PROJECT_REFERENCE_MAX,
} from "@/src/projects/domain/project-contract-rules";

export const projectStatusModel = z
  .enum(PROJECT_STATUSES)
  .describe("ongoing, not_started, on_hold or completed.");

export const projectTypeModel = z
  .enum(PROJECT_TYPE_KEYS)
  .describe(
    `What kind of work the Project is (ADR CM-0013 §1): ${PROJECT_TYPES.map(
      (type) => `${type.key} (${type.label}, ${type.structure})`,
    ).join(", ")}.`,
  );

export const projectStructureModel = z
  .enum(["wings", "locations"])
  .describe(
    "How the Project's places are kept, from its Project Type: a building's Wings, or a list of Locations. A Project without a type has Wings.",
  );

/** Where a Project's logo streams from; `{id}` is the Project. */
export function projectLogoPath(id: string): string {
  return `/api/construction/projects/projects/${id}/logo`;
}

/**
 * The logo URL with the file's version, so a browser refetches after a
 * change; null without a logo.
 */
export function projectLogoUrl(id: string, logoKey: string | null) {
  return logoKey == null
    ? null
    : `${projectLogoPath(id)}?v=${fileVersion(logoKey)}`;
}

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD, in the Company time zone.");

export const ConstructionProjectsCustomFieldModel = z.object({
  label: z
    .string()
    .describe(
      `What the Company calls it, e.g. "Site engineer"; at most ${String(PROJECT_CUSTOM_FIELD_LABEL_MAX)} characters, unique on the Project ignoring case.`,
    ),
  value: z
    .string()
    .describe(
      `Text; at most ${String(PROJECT_CUSTOM_FIELD_VALUE_MAX)} characters.`,
    ),
});

export type ConstructionProjectsCustomFieldModel = z.infer<
  typeof ConstructionProjectsCustomFieldModel
>;

export const ConstructionProjectsProjectResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  status: projectStatusModel,
  projectType: projectTypeModel
    .nullable()
    .describe(
      'The Project Type; null only on Projects added before M4 ("Not set").',
    ),
  structure: projectStructureModel,
  address: z.string().nullable(),
  startDate: calendarDate.nullable(),
  endDate: calendarDate
    .nullable()
    .describe("Expected completion, YYYY-MM-DD; not before the start date."),
  clientName: z.string().nullable(),
  clientPhone: z
    .string()
    .nullable()
    .describe("Indian mobile in E.164, `+91` and ten digits."),
  tenderRef: z.string().nullable().describe("Tender or enquiry reference."),
  quotationNo: z.string().nullable(),
  quotationDate: calendarDate.nullable(),
  loaNo: z.string().nullable().describe("Letter of Award number."),
  loaDate: calendarDate.nullable(),
  clientOrderNo: z
    .string()
    .nullable()
    .describe(
      "The PO / WO the client issued to the Company (the Client Order).",
    ),
  clientOrderDate: calendarDate.nullable(),
  agreementNo: z.string().nullable(),
  agreementDate: calendarDate.nullable(),
  orderValue: z
    .int()
    .nullable()
    .describe(
      "Client Order value excluding GST, in paise; null when not set or without the Project menu's Financial flag.",
    ),
  budgetValue: z
    .int()
    .nullable()
    .describe(
      "The Company's budget for the Project, in paise; null when not set or without the Project menu's Financial flag.",
    ),
  logoUrl: z
    .string()
    .nullable()
    .describe(
      "Streams the Project logo to those who may see the Project; carries the file's version, so it changes when the logo does. Null without a logo.",
    ),
  useLogoInReports: z
    .boolean()
    .describe(
      "Report headers print the Project logo instead of the Company's (used from M9).",
    ),
  stateCode: z
    .string()
    .nullable()
    .describe(
      "The GST state of the site (ADR CM-0015 §1): the two-digit code, e.g. 33 for Tamil Nadu; null when not set.",
    ),
  stateName: z
    .string()
    .nullable()
    .describe("The name of `stateCode`, e.g. Tamil Nadu; null when not set."),
  customFields: z
    .array(ConstructionProjectsCustomFieldModel)
    .describe("In the order they were entered."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you edit."),
});

export type ConstructionProjectsProjectResponseModel = z.infer<
  typeof ConstructionProjectsProjectResponseModel
>;

export const ConstructionProjectsProjectParamsModel = z.object({
  id: z.uuid(),
});

const optionalText = (description: string) =>
  z.string().nullable().optional().describe(description);

const optionalDate = (paper: string) =>
  z
    .string()
    .nullable()
    .optional()
    .describe(
      `${paper} date, YYYY-MM-DD; omitted keeps it, blank or null clears it.`,
    );

const reference = (paper: string) =>
  optionalText(
    `${paper}; at most ${String(PROJECT_REFERENCE_MAX)} characters. Omitted keeps it, blank or null clears it; 400 PROJECT_REFERENCE_TOO_LONG with \`details.field\`.`,
  );

/**
 * The Project form. Strings are checked by the domain, so a screen gets
 * `PROJECT_NAME_REQUIRED`, `PROJECT_DATES_INVALID`… under the right field.
 * The contract details and custom fields (CM-413) are optional: omitted
 * keeps what is stored, so an older client never wipes them.
 */
export const projectDetailsFields = {
  name: z.string().describe("Required; at most 120 characters."),
  status: projectStatusModel.optional().describe("Defaults to ongoing."),
  projectType: projectTypeModel
    .nullable()
    .optional()
    .describe(
      "Required on Add Project: 400 PROJECT_TYPE_REQUIRED when missing or null. On an edit, omitted keeps the stored type and null is 400 PROJECT_TYPE_REQUIRED.",
    ),
  budgetValue: z
    .int()
    .nullable()
    .optional()
    .describe(
      `The Company's budget for the Project, in paise, 0 to ${String(PROJECT_BUDGET_MAX)}; 400 PROJECT_BUDGET_INVALID. Omitted keeps it, null clears it. Ignored without the Project menu's Financial flag.`,
    ),
  useLogoInReports: z
    .boolean()
    .optional()
    .describe(
      "Print the Project logo on report headers instead of the Company's. Defaults to false; omitted keeps it.",
    ),
  stateCode: z
    .string()
    .nullable()
    .optional()
    .describe(
      "The GST state of the site, a two-digit GST state code (e.g. 33 for Tamil Nadu); 400 PROJECT_STATE_INVALID for any other. Omitted keeps it, blank or null clears it.",
    ),
  address: z
    .string()
    .nullable()
    .optional()
    .describe("At most 500 characters; blank clears it."),
  startDate: z
    .string()
    .nullable()
    .optional()
    .describe("YYYY-MM-DD; blank or null for none."),
  endDate: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Expected completion, YYYY-MM-DD; 400 PROJECT_DATES_INVALID before the start date.",
    ),
  clientName: optionalText(
    `At most ${String(PROJECT_CLIENT_NAME_MAX)} characters; 400 PROJECT_CLIENT_NAME_TOO_LONG. Omitted keeps it, blank or null clears it.`,
  ),
  clientPhone: optionalText(
    "An Indian mobile as typed (`98431 22110`, `+91 98431 22110`); stored as E.164. 400 PROJECT_CLIENT_PHONE_INVALID. Omitted keeps it, blank or null clears it.",
  ),
  tenderRef: reference("Tender or enquiry reference"),
  quotationNo: reference("Quotation No."),
  quotationDate: optionalDate("Quotation"),
  loaNo: reference("Letter of Award No."),
  loaDate: optionalDate("Letter of Award"),
  clientOrderNo: reference("PO / WO No. the client issued"),
  clientOrderDate: optionalDate("PO / WO"),
  agreementNo: reference("Agreement No."),
  agreementDate: optionalDate("Agreement"),
  orderValue: z
    .int()
    .nullable()
    .optional()
    .describe(
      `Client Order value excluding GST, in paise, 0 to ${String(PROJECT_ORDER_VALUE_MAX)}; 400 PROJECT_ORDER_VALUE_INVALID. Omitted keeps it, null clears it. Ignored without the Project menu's Financial flag.`,
    ),
  customFields: z
    .array(ConstructionProjectsCustomFieldModel)
    .optional()
    .describe(
      `The whole list, at most ${String(PROJECT_CUSTOM_FIELDS_MAX)}; it replaces the stored one. Omitted keeps it. 400 PROJECT_CUSTOM_FIELDS_LIMIT, PROJECT_CUSTOM_FIELD_LABEL_REQUIRED, PROJECT_CUSTOM_FIELD_VALUE_REQUIRED, PROJECT_CUSTOM_FIELD_TOO_LONG or PROJECT_CUSTOM_FIELD_DUPLICATE with \`details.index\`.`,
    ),
};

/**
 * `financial` is whether the caller has the Project menu's Financial flag;
 * without it `orderValue` and `budgetValue` are null.
 */
export function toProjectResponse(
  item: ProjectReadModel,
  financial: boolean,
): ConstructionProjectsProjectResponseModel {
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    projectType: item.projectType,
    structure: item.structure,
    address: item.address,
    startDate: item.startDate,
    endDate: item.endDate,
    clientName: item.clientName,
    clientPhone: item.clientPhone,
    tenderRef: item.tenderRef,
    quotationNo: item.quotationNo,
    quotationDate: item.quotationDate,
    loaNo: item.loaNo,
    loaDate: item.loaDate,
    clientOrderNo: item.clientOrderNo,
    clientOrderDate: item.clientOrderDate,
    agreementNo: item.agreementNo,
    agreementDate: item.agreementDate,
    orderValue: financial ? item.orderValue : null,
    budgetValue: financial ? item.budgetValue : null,
    logoUrl: projectLogoUrl(item.id, item.logoKey),
    useLogoInReports: item.useLogoInReports,
    stateCode: item.stateCode,
    stateName: item.stateCode == null ? null : gstStateName(item.stateCode),
    customFields: item.customFields.map(({ label, value }) => ({
      label,
      value,
    })),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
