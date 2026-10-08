import { z } from "zod";

import {
  FLAGS,
  MENUS,
  type PermissionGrants,
} from "@/src/shared-kernel/access";
import type { TeamMemberReadModel } from "@/src/organization/application/team-member-read-model";

const MENU_KEYS = MENUS.map((menu) => menu.key) as [string, ...string[]];

/** `{ "<menu key>": ["create", …] }`; unsupported cells are dropped (ADR CM-0003). */
export const PermissionGrantsModel = z.partialRecord(
  z.enum(MENU_KEYS),
  z.array(z.enum(FLAGS)),
);

export const TeamMemberIdParamsModel = z.object({ id: z.uuid() });

export const teamMemberDetailFields = {
  name: z.string().trim().min(1).max(100),
  designationId: z.uuid(),
  mobile: z.string().trim().max(20).nullish(),
  email: z.string().trim().max(254).nullish(),
  address: z.string().trim().max(500).nullish(),
  aadhaar: z.string().trim().max(14).nullish(),
  pan: z.string().trim().max(10).nullish(),
  emergencyContact: z.string().trim().max(120).nullish(),
  memberType: z.enum(["normal", "hrms"]),
};

export const ConstructionOrganizationTeamMemberResponseModel = z.object({
  id: z.uuid(),
  userId: z.string().nullable(),
  name: z.string(),
  designation: z.object({ id: z.uuid(), name: z.string().nullable() }),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  aadhaarMasked: z.string().nullable(),
  panMasked: z.string().nullable(),
  emergencyContact: z.string().nullable(),
  memberType: z.enum(["normal", "hrms"]),
  isOwner: z.boolean(),
  status: z.enum(["joining_pending", "active", "rejected"]),
  projectIds: z.array(z.string()),
  permissions: PermissionGrantsModel,
  invitePath: z.string().nullable(),
  invitedAt: z.iso.datetime().nullable(),
  joinedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionOrganizationTeamMemberResponseModel = z.infer<
  typeof ConstructionOrganizationTeamMemberResponseModel
>;

export function toTeamMemberResponse(
  member: TeamMemberReadModel,
): ConstructionOrganizationTeamMemberResponseModel {
  return {
    ...member,
    permissions: member.permissions satisfies PermissionGrants,
    invitedAt: member.invitedAt?.toISOString() ?? null,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}
