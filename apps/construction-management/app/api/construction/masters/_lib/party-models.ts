import { z } from "zod";

import type { PartyReadModel } from "@/src/masters/application/party-handlers";
import type { PartyKind } from "@/src/masters/domain/party";
import { gstStateName } from "@/src/shared-kernel/gst-states";

import { expectedUpdatedAt } from "./master-models";

const ref = z.object({ id: z.uuid(), name: z.string() });

/** Fields of Add and Edit; the domain trims and checks each (CM-406). */
function writeFields(kind: PartyKind) {
  const common = {
    name: z.string().max(1000).describe("Required, at most 120 characters."),
    contactPerson: z.string().max(1000).nullable().optional(),
    mobile: z
      .string()
      .max(40)
      .nullable()
      .optional()
      .describe("An Indian mobile in any common format; stored as E.164."),
    email: z.string().max(1000).nullable().optional(),
    address: z
      .string()
      .max(2000)
      .nullable()
      .optional()
      .describe("At most 500 characters."),
    gstin: z
      .string()
      .max(30)
      .nullable()
      .optional()
      .describe("15 characters with a valid check character; holds the PAN."),
    pan: z.string().max(30).nullable().optional(),
    stateCode: z
      .string()
      .max(10)
      .nullable()
      .optional()
      .describe(
        "GST state code from `GST_STATES` (400 GST_STATE_INVALID). With a GSTIN the state is its first two digits; a different one is 400 GSTIN_STATE_MISMATCH, and leaving it out follows the GSTIN.",
      ),
    projectIds: z
      .array(z.uuid())
      .max(500)
      .optional()
      .default([])
      .describe("Live Projects of the Active Company (400 PROJECT_NOT_FOUND)."),
  };
  if (kind === "supplier") return common;
  return {
    ...common,
    contactPerson2: z
      .string()
      .max(1000)
      .nullable()
      .optional()
      .describe("Second contact's name, at most 120 characters."),
    mobile2: z
      .string()
      .max(40)
      .nullable()
      .optional()
      .describe("Second contact's Indian mobile (400 MOBILE_2_INVALID)."),
    departmentIds: z
      .array(z.uuid())
      .max(100)
      .optional()
      .default([])
      .describe(
        "Departments the Contractor works in: new ones must be live and enabled (400 DEPARTMENT_NOT_FOUND / DEPARTMENT_DISABLED).",
      ),
  };
}

/**
 * Request and Response models of a Contractor or Supplier master. Each
 * call makes new schema objects, because OpenAPI component names are per
 * schema object.
 */
export function partyModels(kind: PartyKind) {
  const code = kind === "contractor" ? "CONTRACTOR" : "SUPPLIER";
  const response = z.object({
    id: z.uuid(),
    name: z.string(),
    contactPerson: z.string().nullable(),
    /** E.164. */
    mobile: z.string().nullable(),
    email: z.string().nullable(),
    address: z.string().nullable(),
    gstin: z.string().nullable(),
    pan: z.string().nullable(),
    stateCode: z
      .string()
      .nullable()
      .describe(
        "GST state code: the GSTIN's first two digits, or the one picked.",
      ),
    stateName: z.string().nullable(),
    contactPerson2: z
      .string()
      .nullable()
      .describe("A Contractor's second contact; always null for a Supplier."),
    /** E.164. */
    mobile2: z.string().nullable(),
    isActive: z
      .boolean()
      .describe("Inactive ones leave pickers but stay on their Projects."),
    departments: z
      .array(ref)
      .describe("Live Departments, by name; always empty for a Supplier."),
    projects: z.array(ref).describe("Live Projects, by name."),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });
  const fields = writeFields(kind);
  return {
    response,
    list: z.object({
      items: z.array(response),
      nextCursor: z.string().nullable(),
      prevCursor: z.string().nullable(),
      total: z.int().nonnegative(),
    }),
    create: z.object(fields),
    update: z.object({
      ...fields,
      expectedUpdatedAt: expectedUpdatedAt(code),
    }),
  };
}

export type PartyModels = ReturnType<typeof partyModels>;

export type PartyResponseModel = z.infer<PartyModels["response"]>;

/** `GET` a Contractor or Supplier list: newest first, cursor pages. */
export const ListConstructionMastersPartiesQueryModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe("Name, contact person, GSTIN or mobile."),
    active: z.enum(["true", "false"]).optional(),
    projectId: z.uuid().optional().describe("Only those on this Project."),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export function toPartyResponse(item: PartyReadModel): PartyResponseModel {
  return {
    id: item.id,
    name: item.name,
    contactPerson: item.contactPerson,
    mobile: item.mobile,
    email: item.email,
    address: item.address,
    gstin: item.gstin,
    pan: item.pan,
    stateCode: item.stateCode,
    stateName: item.stateCode == null ? null : gstStateName(item.stateCode),
    contactPerson2: item.contactPerson2,
    mobile2: item.mobile2,
    isActive: item.isActive,
    departments: item.departments,
    projects: item.projects,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
