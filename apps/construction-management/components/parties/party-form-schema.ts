import { normalizeMobile } from "@repo/auth/construction/react";
import { z } from "zod";

import { QueryHttpError } from "@/src/queries/http";
import type { Party, PartyInput } from "@/src/queries/parties";
import { isValidGstin, isValidPan } from "@/src/shared-kernel/tax-ids";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        message: "Enter a valid 10-digit mobile number",
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
    departmentIds: z.array(z.string()),
    projectIds: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
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
    email: party?.email ?? "",
    address: party?.address ?? "",
    gstin: party?.gstin ?? "",
    pan: party?.pan ?? "",
    departmentIds: party?.departments.map((item) => item.id) ?? [],
    projectIds: party?.projects.map((item) => item.id) ?? [],
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** What Add and Edit send; Suppliers have no Departments. */
export function partyPayload(
  values: PartyFormValues,
  withDepartments: boolean,
): PartyInput {
  return {
    name: values.name.trim(),
    contactPerson: orNull(values.contactPerson),
    mobile: orNull(values.mobile),
    email: orNull(values.email),
    address: orNull(values.address),
    gstin: orNull(values.gstin),
    pan: orNull(values.pan),
    projectIds: values.projectIds,
    ...(withDepartments ? { departmentIds: values.departmentIds } : {}),
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
  DEPARTMENT_NOT_FOUND: "departmentIds",
  DEPARTMENT_DISABLED: "departmentIds",
  PROJECT_NOT_FOUND: "projectIds",
};

/** The field a server error belongs under, or null for the form. */
export function partyErrorField(error: unknown): keyof PartyFormValues | null {
  if (!(error instanceof QueryHttpError)) return null;
  if (/^(CONTRACTOR|SUPPLIER)_NAME_/.test(error.code)) return "name";
  return FIELD_BY_CODE[error.code] ?? null;
}
