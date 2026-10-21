import { z } from "zod";

import type {
  ClientOption,
  StoredClient,
} from "@/src/masters/application/client-handlers";
import {
  CLIENT_ADDRESS_MAX,
  CLIENT_CONTACT_PERSON_MAX,
  CLIENT_NAME_MAX,
} from "@/src/masters/domain/client";
import { gstStateName } from "@/src/shared-kernel/gst-states";

export const CLIENTS_PATH = "/api/construction/masters/clients";

const fields = {
  name: z
    .string()
    .max(1000)
    .describe(
      `Required, at most ${String(CLIENT_NAME_MAX)} characters; unique among the Company's live Clients ignoring case (409 CLIENT_NAME_TAKEN).`,
    ),
  contactPerson: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .describe(`At most ${String(CLIENT_CONTACT_PERSON_MAX)} characters.`),
  mobile: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .describe("A mobile in any common format; stored as E.164."),
  email: z.string().max(1000).nullable().optional(),
  address: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe(
      `The billing address printed on tax invoices; at most ${String(CLIENT_ADDRESS_MAX)} characters.`,
    ),
  pinCode: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .describe("Six digits (400 PIN_CODE_INVALID)."),
  gstin: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .describe(
      "15 characters with a valid check character (400 GSTIN_INVALID); fills the GST state.",
    ),
  pan: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .describe(
      "10 characters (400 PAN_INVALID); a GSTIN must contain it (400 GSTIN_PAN_MISMATCH).",
    ),
  tan: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .describe(
      "Tax deduction account number when the Client deducts TDS: AAAA99999A (400 TAN_INVALID).",
    ),
  stateCode: z
    .string()
    .max(10)
    .nullable()
    .optional()
    .describe(
      "GST state code (400 GST_STATE_INVALID). With a GSTIN the state is its first two digits; a different one is 400 GSTIN_STATE_MISMATCH.",
    ),
  isActive: z
    .boolean()
    .optional()
    .describe(
      "Inactive Clients leave the Project form's picker but stay on their Projects. Defaults to true; omitted on an edit keeps it.",
    ),
};

export const CreateConstructionMastersClientRequestModel = z.object(fields);
export type CreateConstructionMastersClientRequestModel = z.input<
  typeof CreateConstructionMastersClientRequestModel
>;

export const UpdateConstructionMastersClientRequestModel = z.object({
  ...fields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded; 409 CLIENT_CHANGED when someone saved since.",
    ),
});
export type UpdateConstructionMastersClientRequestModel = z.input<
  typeof UpdateConstructionMastersClientRequestModel
>;

export const DeleteConstructionMastersClientRequestModel = z.object({
  expectedUpdatedAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .describe("When sent, 409 CLIENT_CHANGED if someone saved since."),
});

export const ConstructionMastersClientParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionMastersClientsRequestModel = z
  .object({
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe("Name, contact person, email, GSTIN or mobile."),
    active: z
      .enum(["true", "false"])
      .optional()
      .describe("Only active (true) or inactive (false) Clients."),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ConstructionMastersClientResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  contactPerson: z.string().nullable(),
  mobile: z.string().nullable().describe("E.164."),
  email: z.string().nullable(),
  address: z.string().nullable(),
  pinCode: z.string().nullable(),
  gstin: z.string().nullable(),
  pan: z.string().nullable(),
  tan: z.string().nullable(),
  stateCode: z
    .string()
    .nullable()
    .describe("The GSTIN's first two digits, or the one picked."),
  stateName: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you edit."),
});
export type ConstructionMastersClientResponseModel = z.infer<
  typeof ConstructionMastersClientResponseModel
>;

export const ListConstructionMastersClientsResponseModel = z.object({
  items: z.array(ConstructionMastersClientResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
});
export type ListConstructionMastersClientsResponseModel = z.infer<
  typeof ListConstructionMastersClientsResponseModel
>;

export const ListConstructionMastersClientOptionsRequestModel = z.object({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .describe("Name or GSTIN; active Clients only."),
  ids: z
    .string()
    .max(2000)
    .optional()
    .describe(
      "Comma-separated ids: those live Clients, active or not (a form's current Client).",
    ),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const ConstructionMastersClientOptionModel = z.object({
  id: z.uuid(),
  name: z.string(),
  gstin: z.string().nullable(),
  stateCode: z.string().nullable(),
  isActive: z.boolean(),
});
export type ConstructionMastersClientOptionModel = z.infer<
  typeof ConstructionMastersClientOptionModel
>;

export const ListConstructionMastersClientOptionsResponseModel = z.object({
  items: z.array(ConstructionMastersClientOptionModel),
});
export type ListConstructionMastersClientOptionsResponseModel = z.infer<
  typeof ListConstructionMastersClientOptionsResponseModel
>;

export function toClientResponse(
  client: StoredClient,
): ConstructionMastersClientResponseModel {
  return {
    id: client.id,
    name: client.name,
    contactPerson: client.contactPerson,
    mobile: client.mobile,
    email: client.email,
    address: client.address,
    pinCode: client.pinCode,
    gstin: client.gstin,
    pan: client.pan,
    tan: client.tan,
    stateCode: client.stateCode,
    stateName: client.stateCode == null ? null : gstStateName(client.stateCode),
    isActive: client.isActive,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

export function toClientOptionResponse(
  option: ClientOption,
): ConstructionMastersClientOptionModel {
  return {
    id: option.id,
    name: option.name,
    gstin: option.gstin,
    stateCode: option.stateCode,
    isActive: option.isActive,
  };
}
