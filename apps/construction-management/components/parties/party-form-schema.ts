import { normalizeMobile } from "@repo/auth/construction/react";
import { z } from "zod";

import { QueryHttpError } from "@/src/queries/http";
import type { Party, PartyInput } from "@/src/queries/parties";
import { GST_STATES, gstStateName } from "@/src/shared-kernel/gst-states";
import { isValidGstin, isValidPan } from "@/src/shared-kernel/tax-ids";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MOBILE_MESSAGE = "Enter a valid 10-digit mobile number";

/** The state a valid GSTIN is registered in (its first two digits), or null. */
export function gstinState(gstin: string): string | null {
  const value = gstin.trim().toUpperCase();
  return isValidGstin(value) ? value.slice(0, 2) : null;
}

/** The GST state select's "Not set" item; the form keeps "" for it. */
export const NO_STATE = "none";

/** "Tamil Nadu (33)"; a retired code a GSTIN still carries shows bare. */
export function gstStateLabel(code: string): string {
  const name = gstStateName(code);
  return name == null ? `State code ${code}` : `${name} (${code})`;
}

export const GST_STATE_ITEMS: { value: string; label: string }[] = [
  { value: NO_STATE, label: "Not set" },
  ...GST_STATES.map((state) => ({
    value: state.code,
    label: gstStateLabel(state.code),
  })),
];

/** Client checks; the server repeats every rule (CM-406). */
export const partyFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the name")
      .max(120, "Use at most 120 characters"),
    contactPerson: z.string().trim().max(120, "Use at most 120 characters"),
    mobile: z
      .string()
      .trim()
      .refine((value) => value === "" || normalizeMobile(value) != null, {
        message: MOBILE_MESSAGE,
      }),
    contactPerson2: z.string().trim().max(120, "Use at most 120 characters"),
    mobile2: z
      .string()
      .trim()
      .refine((value) => value === "" || normalizeMobile(value) != null, {
        message: MOBILE_MESSAGE,
      }),
    email: z
      .string()
      .trim()
      .refine((value) => value === "" || EMAIL.test(value), {
        message: "Enter a valid email address",
      }),
    address: z.string().max(500, "Use at most 500 characters"),
    gstin: z
      .string()
      .trim()
      .refine((value) => value === "" || isValidGstin(value), {
        message: "Enter a valid 15-character GSTIN",
      }),
    pan: z
      .string()
      .trim()
      .refine((value) => value === "" || isValidPan(value), {
        message: "Enter a valid 10-character PAN",
      }),
    /** A GST state code, or "" for Not set. */
    stateCode: z.string(),
    /** Contractors' TDS settings (CM-706). */
    tdsApplicable: z.boolean(),
    /** Checked only while TDS applies; ignored (and sent as null) when off. */
    tdsLowerRate: z.string().trim(),
    tdsNote: z.string().trim().max(500, "Use at most 500 characters"),
    departmentIds: z.array(z.string()),
    projectIds: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    const rate = values.tdsLowerRate;
    if (
      values.tdsApplicable &&
      rate !== "" &&
      !(/^\d{1,3}(\.\d{1,2})?$/.test(rate) && Number(rate) <= 100)
    )
      ctx.addIssue({
        code: "custom",
        path: ["tdsLowerRate"],
        message: "Enter a percent from 0 to 100, like 0.75",
      });
    const gstin = values.gstin.trim().toUpperCase();
    const pan = values.pan.trim().toUpperCase();
    if (
      gstin !== "" &&
      pan !== "" &&
      isValidGstin(gstin) &&
      gstin.slice(2, 12) !== pan
    )
      ctx.addIssue({
        code: "custom",
        path: ["gstin"],
        message: "The GSTIN must contain this PAN",
      });
  });

export type PartyFormValues = z.infer<typeof partyFormSchema>;

/** The number as typed beside the +91 prefix. */
function nationalMobile(value: string | null): string {
  if (value == null) return "";
  return value.startsWith("+91") ? value.slice(3) : value;
}

export function partyFormDefaults(party: Party | null): PartyFormValues {
  return {
    name: party?.name ?? "",
    contactPerson: party?.contactPerson ?? "",
    mobile: nationalMobile(party?.mobile ?? null),
    contactPerson2: party?.contactPerson2 ?? "",
    mobile2: nationalMobile(party?.mobile2 ?? null),
    email: party?.email ?? "",
    address: party?.address ?? "",
    gstin: party?.gstin ?? "",
    pan: party?.pan ?? "",
    stateCode: party?.stateCode ?? "",
    tdsApplicable: party?.tds?.applicable ?? true,
    tdsLowerRate: party?.tds?.lowerRate ?? "",
    tdsNote: party?.tds?.note ?? "",
    departmentIds: party?.departments.map((item) => item.id) ?? [],
    projectIds: party?.projects.map((item) => item.id) ?? [],
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * What Add and Edit send. With a valid GSTIN the state is the GSTIN's; a
 * Supplier has no Departments and no second contact (Contractors only).
 */
export function partyPayload(
  values: PartyFormValues,
  contractor: boolean,
): PartyInput {
  const gstin = orNull(values.gstin);
  const stateCode =
    (gstin == null ? null : gstinState(gstin)) ?? orNull(values.stateCode);
  return {
    name: values.name.trim(),
    contactPerson: orNull(values.contactPerson),
    mobile: orNull(values.mobile),
    email: orNull(values.email),
    address: orNull(values.address),
    gstin,
    pan: orNull(values.pan),
    stateCode,
    projectIds: values.projectIds,
    ...(contractor
      ? {
          contactPerson2: orNull(values.contactPerson2),
          mobile2: orNull(values.mobile2),
          departmentIds: values.departmentIds,
          tdsApplicable: values.tdsApplicable,
          tdsLowerRate: values.tdsApplicable
            ? orNull(values.tdsLowerRate)
            : null,
          tdsNote: orNull(values.tdsNote),
        }
      : {}),
  };
}

const FIELD_BY_CODE: Record<string, keyof PartyFormValues> = {
  CONTACT_PERSON_TOO_LONG: "contactPerson",
  MOBILE_INVALID: "mobile",
  EMAIL_INVALID: "email",
  ADDRESS_TOO_LONG: "address",
  GSTIN_INVALID: "gstin",
  GSTIN_PAN_MISMATCH: "gstin",
  PAN_INVALID: "pan",
  GST_STATE_INVALID: "stateCode",
  GSTIN_STATE_MISMATCH: "stateCode",
  CONTACT_PERSON_2_TOO_LONG: "contactPerson2",
  MOBILE_2_INVALID: "mobile2",
  DEPARTMENT_NOT_FOUND: "departmentIds",
  DEPARTMENT_DISABLED: "departmentIds",
  PROJECT_NOT_FOUND: "projectIds",
  TDS_LOWER_RATE_INVALID: "tdsLowerRate",
  TDS_NOTE_TOO_LONG: "tdsNote",
};

/** The field a server error belongs under, or null for the form. */
export function partyErrorField(error: unknown): keyof PartyFormValues | null {
  if (!(error instanceof QueryHttpError)) return null;
  if (/^(CONTRACTOR|SUPPLIER)_NAME_/.test(error.code)) return "name";
  return FIELD_BY_CODE[error.code] ?? null;
}
