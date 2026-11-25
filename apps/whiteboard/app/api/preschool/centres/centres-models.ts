import { z } from "zod";

// Codes, PIN codes, royalty decimals and franchise rules are checked by the
// domain (`src/preschool/domain/centre.ts`) so each has its own error code.

const text = (max: number) => z.string().max(max).nullable().optional();

export const PreschoolCentreParamsModel = z.object({ id: z.uuid() });

export const PreschoolCentreOwnershipModel = z.enum([
  "company_owned",
  "franchised",
]);

export const UpdatePreschoolCentreDetailsRequestModel = z.object({
  name: z.string().min(1).max(200),
  /** 2–6 letters or digits; stored upper case, unique in the Workspace. */
  code: z.string().max(20),
  phone: text(32),
  email: z.email().max(320).nullable().optional(),
  addressLine: text(300),
  city: text(100),
  state: text(100),
  /** 6 digits. */
  pincode: text(10),
});

const franchiseFields = {
  ownership: PreschoolCentreOwnershipModel,
  /** Required for a Franchised Centre. */
  franchiseeName: text(200),
  franchiseePhone: text(32),
  franchiseeEmail: z.email().max(320).nullable().optional(),
  agreementStartOn: z.iso.date().nullable().optional(),
  agreementEndOn: z.iso.date().nullable().optional(),
  /** 0–100 with at most two decimals; ignored for a Company-owned Centre. */
  royaltyPercent: z.number().min(0).max(100).nullable().optional(),
};

export const UpdatePreschoolCentreFranchiseRequestModel = z.object({
  ...franchiseFields,
  /** The Centre may change the amounts of the Head Office Fee Structure. */
  mayOverrideFees: z.boolean(),
});

export const CreatePreschoolCentreRequestModel = z.object({
  ...UpdatePreschoolCentreDetailsRequestModel.shape,
  ...franchiseFields,
  /** Defaults to true. */
  mayOverrideFees: z.boolean().optional(),
});

export const PreschoolCentreResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
  ownership: PreschoolCentreOwnershipModel,
  status: z.enum(["active", "closed"]),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  pincode: z.string().nullable(),
  franchiseeName: z.string().nullable(),
  franchiseePhone: z.string().nullable(),
  franchiseeEmail: z.string().nullable(),
  agreementStartOn: z.iso.date().nullable(),
  agreementEndOn: z.iso.date().nullable(),
  royaltyPercent: z.number(),
  mayOverrideFees: z.boolean(),
  /** Children whose status is active. */
  activeChildren: z.number().int(),
  /** Classrooms of the current Academic Year. */
  classrooms: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ListPreschoolCentresResponseModel = z.object({
  items: z.array(PreschoolCentreResponseModel),
});
