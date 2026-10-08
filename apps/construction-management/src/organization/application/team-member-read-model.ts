import type { PermissionGrants } from "@/src/shared-kernel/access";
import { maskIdentifier } from "@/src/shared-kernel/tax-ids";

import type { MemberType } from "../domain/starting-permissions";
import type { TeamMember, TeamMemberStatus } from "../domain/team-member";

export type TeamMemberReadModel = {
  id: string;
  userId: string | null;
  name: string;
  designation: { id: string; name: string | null };
  mobile: string | null;
  email: string | null;
  address: string | null;
  /** `XXXXXXXX2346`; the full value only through reveal. */
  aadhaarMasked: string | null;
  panMasked: string | null;
  emergencyContact: string | null;
  memberType: MemberType;
  isOwner: boolean;
  status: TeamMemberStatus;
  projectIds: string[];
  permissions: PermissionGrants;
  /** `/join/<token>` while Joining Pending; null otherwise. */
  invitePath: string | null;
  invitedAt: Date | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toTeamMemberReadModel(
  member: TeamMember,
  designationNames: ReadonlyMap<string, string>,
): TeamMemberReadModel {
  const { details } = member;
  return {
    id: member.id,
    userId: member.userId,
    name: details.name,
    designation: {
      id: details.designationId,
      name: designationNames.get(details.designationId) ?? null,
    },
    mobile: details.mobile,
    email: details.email,
    address: details.address,
    aadhaarMasked:
      details.aadhaar == null ? null : maskIdentifier(details.aadhaar),
    panMasked: details.pan == null ? null : maskIdentifier(details.pan),
    emergencyContact: details.emergencyContact,
    memberType: member.memberType,
    isOwner: member.isOwner,
    status: member.status,
    projectIds: [...member.projectIds],
    permissions: member.permissions.toGrants(),
    invitePath:
      member.status === "joining_pending" && member.inviteToken != null
        ? `/join/${member.inviteToken}`
        : null,
    invitedAt: member.invitedAt,
    joinedAt: member.joinedAt,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}
