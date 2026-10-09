import { z } from "zod";

import type { SupervisorReadModel } from "@/src/masters/application/supervisor-handlers";

import { expectedUpdatedAt } from "../_lib/master-models";

export const ConstructionMastersSupervisorResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  /** E.164. */
  mobile: z.string().nullable(),
  teamMemberId: z
    .uuid()
    .nullable()
    .describe("The Team Member this Supervisor is, if any."),
  teamMemberName: z
    .string()
    .nullable()
    .describe("That Team Member's name now; null once they leave the Company."),
  disabled: z.boolean().describe("Off the pickers; old records keep it."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionMastersSupervisorResponseModel = z.infer<
  typeof ConstructionMastersSupervisorResponseModel
>;

export const ListConstructionMastersSupervisorsResponseModel = z.object({
  items: z.array(ConstructionMastersSupervisorResponseModel),
  total: z.int().nonnegative(),
});
export type ListConstructionMastersSupervisorsResponseModel = z.infer<
  typeof ListConstructionMastersSupervisorsResponseModel
>;

const details = {
  /** Trimmed and checked (required, at most 100) by the domain. */
  name: z.string().max(1000),
  mobile: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .describe("Any common Indian format or E.164; stored as E.164."),
  teamMemberId: z
    .uuid()
    .nullable()
    .optional()
    .describe("A live Team Member of the Active Company."),
};

export const CreateConstructionMastersSupervisorRequestModel =
  z.object(details);
export type CreateConstructionMastersSupervisorRequestModel = z.infer<
  typeof CreateConstructionMastersSupervisorRequestModel
>;

/** Replaces name, mobile and Team Member together. */
export const UpdateConstructionMastersSupervisorRequestModel = z.object({
  ...details,
  expectedUpdatedAt: expectedUpdatedAt("SUPERVISOR"),
});
export type UpdateConstructionMastersSupervisorRequestModel = z.infer<
  typeof UpdateConstructionMastersSupervisorRequestModel
>;

export function toSupervisorResponse(
  item: SupervisorReadModel,
): ConstructionMastersSupervisorResponseModel {
  return {
    id: item.id,
    name: item.name,
    mobile: item.mobile,
    teamMemberId: item.teamMemberId,
    teamMemberName: item.teamMemberName,
    disabled: item.disabled,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
