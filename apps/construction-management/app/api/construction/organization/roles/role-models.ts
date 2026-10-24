import { z } from "zod";

import type { RoleReadModel } from "@/src/organization/application/role-read-model";
import { ROLE_DESCRIPTION_MAX } from "@/src/organization/domain/role";
import type { PermissionGrants } from "@/src/shared-kernel/access";

import { PermissionGrantsModel } from "../team-members/team-member-models";

export const ROLES_PATH = "/api/construction/organization/roles";

export const ConstructionOrganizationRoleParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionOrganizationRoleResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  /** Copied from the seed set when the Company was created ("Default"). */
  isSeed: z.boolean(),
  permissions: PermissionGrantsModel,
  userCount: z
    .int()
    .nonnegative()
    .describe("Live Team Members other than the Owner on this Role"),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionOrganizationRoleResponseModel = z.infer<
  typeof ConstructionOrganizationRoleResponseModel
>;

export const ListConstructionOrganizationRolesResponseModel = z.object({
  items: z.array(ConstructionOrganizationRoleResponseModel),
});

export type ListConstructionOrganizationRolesResponseModel = z.infer<
  typeof ListConstructionOrganizationRolesResponseModel
>;

/**
 * Name (unique among the Company's live Roles, ignoring case; 400
 * `ROLE_NAME_REQUIRED` / `ROLE_NAME_TOO_LONG` over 100), an optional
 * description and the whole matrix. Unknown menus or flags are a 400;
 * flags a menu does not support are dropped.
 */
const roleFields = {
  name: z.string().max(1000),
  description: z.string().max(ROLE_DESCRIPTION_MAX).nullish(),
  permissions: PermissionGrantsModel,
};

export const CreateConstructionOrganizationRoleRequestModel =
  z.object(roleFields);

export const UpdateConstructionOrganizationRoleRequestModel = z.object({
  ...roleFields,
  updatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` the screen loaded; 409 `STALE_ROLE` when someone saved the Role since",
    ),
});

export function toRoleResponse(
  role: RoleReadModel,
): ConstructionOrganizationRoleResponseModel {
  return {
    ...role,
    permissions: role.permissions satisfies PermissionGrants,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}
