import { normalizeMobile } from "@repo/auth/construction/react";
import { z } from "zod";

import { gstinState } from "@/components/parties/party-form-schema";
import { QueryHttpError } from "@/src/queries/http";
import type {
  OtherParty,
  OtherPartyInput,
} from "@/src/queries/finance-other-parties";
import { isValidGstin, isValidPan } from "@/src/shared-kernel/tax-ids";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const OTHER_PARTIES_PATH = "/app/masters/other-parties";

export function otherPartyEditPath(id: string): string {
  return `${OTHER_PARTIES_PATH}/${encodeURIComponent(id)}`;
}

/** Client checks; the server repeats every rule (CM-704). */
export const otherPartyFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the name")
      .max(120, "Use at most 120 characters"),
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
    address: z.string().max(500, "Use at most 500 characters"),
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

export type OtherPartyFormValues = z.infer<typeof otherPartyFormSchema>;

/** The number as typed beside the +91 prefix. */
function nationalMobile(value: string | null): string {
  if (value == null) return "";
  return value.startsWith("+91") ? value.slice(3) : value;
}

export function otherPartyFormDefaults(
  party: OtherParty | null,
): OtherPartyFormValues {
  return {
    name: party?.name ?? "",
    mobile: nationalMobile(party?.mobile ?? null),
    email: party?.email ?? "",
    gstin: party?.gstin ?? "",
    pan: party?.pan ?? "",
    stateCode: party?.stateCode ?? "",
    address: party?.address ?? "",
    projectIds: party?.projects.map((item) => item.id) ?? [],
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** What Add and Edit send; a valid GSTIN fixes the state. */
export function otherPartyPayload(
  values: OtherPartyFormValues,
): OtherPartyInput {
  const gstin = orNull(values.gstin);
  return {
    name: values.name.trim(),
    mobile: orNull(values.mobile),
    email: orNull(values.email),
    gstin,
    pan: orNull(values.pan),
    stateCode:
      (gstin == null ? null : gstinState(gstin)) ?? orNull(values.stateCode),
    address: orNull(values.address),
    projectIds: values.projectIds,
  };
}

const FIELD_BY_CODE: Record<string, keyof OtherPartyFormValues> = {
  OTHER_PARTY_NAME_REQUIRED: "name",
  OTHER_PARTY_NAME_TOO_LONG: "name",
  OTHER_PARTY_NAME_TAKEN: "name",
  MOBILE_INVALID: "mobile",
  EMAIL_INVALID: "email",
  ADDRESS_TOO_LONG: "address",
  GSTIN_INVALID: "gstin",
  GSTIN_PAN_MISMATCH: "gstin",
  PAN_INVALID: "pan",
  GST_STATE_INVALID: "stateCode",
  GSTIN_STATE_MISMATCH: "stateCode",
  PROJECT_NOT_FOUND: "projectIds",
};

/** The field a server error belongs under, or null for the form. */
export function otherPartyErrorField(
  error: unknown,
): keyof OtherPartyFormValues | null {
  if (!(error instanceof QueryHttpError)) return null;
  return FIELD_BY_CODE[error.code] ?? null;
}
