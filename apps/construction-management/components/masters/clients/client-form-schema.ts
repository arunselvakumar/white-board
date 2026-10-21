import { normalizeMobile } from "@repo/auth/construction/react";
import { z } from "zod";

import { gstinState } from "@/components/parties/party-form-schema";
import { isValidPinCode, isValidTan } from "@/src/masters/domain/client";
import { QueryHttpError } from "@/src/queries/http";
import type { Client, ClientInput } from "@/src/queries/masters-clients";
import { isValidGstin, isValidPan } from "@/src/shared-kernel/tax-ids";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CLIENTS_PATH = "/app/masters/clients";

export function clientEditPath(id: string): string {
  return `${CLIENTS_PATH}/${encodeURIComponent(id)}`;
}

/** Client checks; the server repeats every rule (CM-1101). */
export const clientFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the Client's name")
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
    pinCode: z
      .string()
      .trim()
      .refine((value) => value === "" || isValidPinCode(value), {
        message: "Enter the 6-digit PIN code",
      }),
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
    tan: z
      .string()
      .trim()
      .refine((value) => value === "" || isValidTan(value), {
        message: "Enter a valid TAN, like CHEA12345B",
      }),
    /** A GST state code, or "" for Not set. */
    stateCode: z.string(),
    isActive: z.boolean(),
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

export type ClientFormValues = z.infer<typeof clientFormSchema>;

/** The number as typed beside the +91 prefix. */
function nationalMobile(value: string | null): string {
  if (value == null) return "";
  return value.startsWith("+91") ? value.slice(3) : value;
}

export function clientFormDefaults(client: Client | null): ClientFormValues {
  return {
    name: client?.name ?? "",
    contactPerson: client?.contactPerson ?? "",
    mobile: nationalMobile(client?.mobile ?? null),
    email: client?.email ?? "",
    address: client?.address ?? "",
    pinCode: client?.pinCode ?? "",
    gstin: client?.gstin ?? "",
    pan: client?.pan ?? "",
    tan: client?.tan ?? "",
    stateCode: client?.stateCode ?? "",
    isActive: client?.isActive ?? true,
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** What Add and Edit send; a valid GSTIN fixes the state. */
export function clientPayload(values: ClientFormValues): ClientInput {
  const gstin = orNull(values.gstin);
  return {
    name: values.name.trim(),
    contactPerson: orNull(values.contactPerson),
    mobile: orNull(values.mobile),
    email: orNull(values.email),
    address: orNull(values.address),
    pinCode: orNull(values.pinCode),
    gstin,
    pan: orNull(values.pan),
    tan: orNull(values.tan),
    stateCode:
      (gstin == null ? null : gstinState(gstin)) ?? orNull(values.stateCode),
    isActive: values.isActive,
  };
}

const FIELD_BY_CODE: Record<string, keyof ClientFormValues> = {
  CLIENT_NAME_REQUIRED: "name",
  CLIENT_NAME_TOO_LONG: "name",
  CLIENT_NAME_TAKEN: "name",
  CONTACT_PERSON_TOO_LONG: "contactPerson",
  MOBILE_INVALID: "mobile",
  EMAIL_INVALID: "email",
  ADDRESS_TOO_LONG: "address",
  PIN_CODE_INVALID: "pinCode",
  GSTIN_INVALID: "gstin",
  GSTIN_PAN_MISMATCH: "gstin",
  PAN_INVALID: "pan",
  TAN_INVALID: "tan",
  GST_STATE_INVALID: "stateCode",
  GSTIN_STATE_MISMATCH: "stateCode",
};

/** The field a server error belongs under, or null for the form. */
export function clientErrorField(
  error: unknown,
): keyof ClientFormValues | null {
  if (!(error instanceof QueryHttpError)) return null;
  return FIELD_BY_CODE[error.code] ?? null;
}
