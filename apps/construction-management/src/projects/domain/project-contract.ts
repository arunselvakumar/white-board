import { normalizeMobile } from "@repo/auth/construction/mobile";

import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  PROJECT_CLIENT_NAME_MAX,
  PROJECT_CUSTOM_FIELD_LABEL_MAX,
  PROJECT_CUSTOM_FIELD_VALUE_MAX,
  PROJECT_CUSTOM_FIELDS_MAX,
  PROJECT_DATE_FIELDS,
  PROJECT_ORDER_VALUE_MAX,
  PROJECT_REFERENCE_FIELDS,
  PROJECT_REFERENCE_MAX,
  type ProjectDateField,
  type ProjectReferenceField,
} from "./project-contract-rules";

/**
 * Who gave the work and the papers that gave it (CM-413). The Client Order
 * is the PO / WO the client issued to the Company, not a Purchase Order the
 * Company sends a supplier. `orderValue` is paise, excluding GST.
 */
export type ProjectContractDetails = {
  clientName: string | null;
  /** E.164, `+91…`. */
  clientPhone: string | null;
  orderValue: number | null;
} & Record<ProjectReferenceField, string | null> &
  Record<ProjectDateField, CalendarDate | null>;

/** As typed: `undefined` means "not sent" (an edit keeps the stored value). */
export type ProjectContractInput = {
  clientName?: string | null;
  clientPhone?: string | null;
  orderValue?: number | null;
} & Partial<Record<ProjectReferenceField | ProjectDateField, string | null>>;

/** A field the Company named itself, e.g. "Site engineer". */
export type ProjectCustomField = { label: string; value: string };

export const NO_CONTRACT_DETAILS: ProjectContractDetails = {
  clientName: null,
  clientPhone: null,
  tenderRef: null,
  quotationNo: null,
  quotationDate: null,
  loaNo: null,
  loaDate: null,
  clientOrderNo: null,
  clientOrderDate: null,
  agreementNo: null,
  agreementDate: null,
  orderValue: null,
};

/** Single-line text: spaces tidied, blank is none. */
function singleLine(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  return value === "" ? null : value;
}

function cleanClientName(raw: string | null | undefined): string | null {
  const name = singleLine(raw);
  if (name != null && name.length > PROJECT_CLIENT_NAME_MAX)
    throw new DomainError(
      "PROJECT_CLIENT_NAME_TOO_LONG",
      `Client name must be at most ${String(PROJECT_CLIENT_NAME_MAX)} characters.`,
    );
  return name;
}

/** Indian mobiles only: a client here is an Indian builder or department. */
function cleanClientPhone(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  const mobile = normalizeMobile(value);
  if (!mobile?.startsWith("+91"))
    throw new DomainError(
      "PROJECT_CLIENT_PHONE_INVALID",
      "Enter the client's 10-digit mobile number, like 98431 22110.",
    );
  return mobile;
}

function cleanReference(
  field: ProjectReferenceField,
  raw: string | null | undefined,
): string | null {
  const value = singleLine(raw);
  if (value != null && value.length > PROJECT_REFERENCE_MAX)
    throw new DomainError(
      "PROJECT_REFERENCE_TOO_LONG",
      `This number must be at most ${String(PROJECT_REFERENCE_MAX)} characters.`,
      { details: { field } },
    );
  return value;
}

/** No order between the papers: a PO may be dated before its quotation. */
function cleanPaperDate(
  field: ProjectDateField,
  raw: string | null | undefined,
): CalendarDate | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  if (!isCalendarDate(value))
    throw new DomainError(
      "PROJECT_DATE_INVALID",
      `"${value}" is not a date (YYYY-MM-DD).`,
      { details: { field } },
    );
  return value;
}

function cleanOrderValue(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  if (!Number.isSafeInteger(raw) || raw < 0 || raw > PROJECT_ORDER_VALUE_MAX)
    throw new DomainError(
      "PROJECT_ORDER_VALUE_INVALID",
      "Enter the order value in rupees, up to ₹1,000 crore.",
    );
  return raw;
}

/**
 * The contract details as saved. A field left out keeps `current` (so an
 * older client never wipes it); null or blank clears it. A new Project
 * passes `NO_CONTRACT_DETAILS`.
 */
export function contractDetails(
  input: ProjectContractInput,
  current: ProjectContractDetails,
): ProjectContractDetails {
  const next: ProjectContractDetails = {
    ...current,
    ...(input.clientName === undefined
      ? {}
      : { clientName: cleanClientName(input.clientName) }),
    ...(input.clientPhone === undefined
      ? {}
      : { clientPhone: cleanClientPhone(input.clientPhone) }),
    ...(input.orderValue === undefined
      ? {}
      : { orderValue: cleanOrderValue(input.orderValue) }),
  };
  for (const field of PROJECT_REFERENCE_FIELDS) {
    const raw = input[field];
    if (raw !== undefined) next[field] = cleanReference(field, raw);
  }
  for (const field of PROJECT_DATE_FIELDS) {
    const raw = input[field];
    if (raw !== undefined) next[field] = cleanPaperDate(field, raw);
  }
  return next;
}

function customFieldError(
  code: string,
  message: string,
  index: number,
  field?: "label" | "value",
): DomainError {
  return new DomainError(code, message, {
    details: field == null ? { index } : { index, field },
  });
}

/**
 * The custom-field list as saved, in the order typed. A row with neither
 * label nor value is an empty form row and is dropped; otherwise both are
 * needed. Labels are unique ignoring case. Errors carry `details.index`,
 * the row's place in the list as sent, so the form marks the right row.
 */
export function customFields(
  input: readonly { label: string; value: string }[],
): ProjectCustomField[] {
  const rows = input
    .map((row, index) => ({
      index,
      label: row.label.trim().replace(/\s+/g, " "),
      value: row.value.trim(),
    }))
    .filter((row) => row.label !== "" || row.value !== "");
  if (rows.length > PROJECT_CUSTOM_FIELDS_MAX)
    throw new DomainError(
      "PROJECT_CUSTOM_FIELDS_LIMIT",
      `A Project can have at most ${String(PROJECT_CUSTOM_FIELDS_MAX)} custom fields.`,
      { details: { max: PROJECT_CUSTOM_FIELDS_MAX } },
    );
  const seen = new Set<string>();
  return rows.map(({ index, label, value }) => {
    if (label === "")
      throw customFieldError(
        "PROJECT_CUSTOM_FIELD_LABEL_REQUIRED",
        "Name this field.",
        index,
      );
    if (value === "")
      throw customFieldError(
        "PROJECT_CUSTOM_FIELD_VALUE_REQUIRED",
        "Enter a value, or remove this field.",
        index,
      );
    if (label.length > PROJECT_CUSTOM_FIELD_LABEL_MAX)
      throw customFieldError(
        "PROJECT_CUSTOM_FIELD_TOO_LONG",
        `A field name must be at most ${String(PROJECT_CUSTOM_FIELD_LABEL_MAX)} characters.`,
        index,
        "label",
      );
    if (value.length > PROJECT_CUSTOM_FIELD_VALUE_MAX)
      throw customFieldError(
        "PROJECT_CUSTOM_FIELD_TOO_LONG",
        `A value must be at most ${String(PROJECT_CUSTOM_FIELD_VALUE_MAX)} characters.`,
        index,
        "value",
      );
    const key = label.toLowerCase();
    if (seen.has(key))
      throw customFieldError(
        "PROJECT_CUSTOM_FIELD_DUPLICATE",
        `"${label}" is already a field on this Project.`,
        index,
      );
    seen.add(key);
    return { label, value };
  });
}
