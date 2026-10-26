import { newId } from "@/src/shared-kernel/ids";

import type { CompanyDetails } from "./company-details";
import type { CompanyCreated } from "./events";
import type { Role } from "./role";
import { TeamMember, teamMemberDetails } from "./team-member";

export type CompanyOwner = {
  userId: string;
  name: string;
  mobile: string | null;
  email: string | null;
};

/**
 * Everything written when a Company is created (CM-104): its profile, its
 * Owner, and its seed sets. No Subscription: a Company has none until its
 * Owner buys a plan (CM-117). The Workspace itself already exists in
 * `@repo/auth`.
 */
export class NewCompany {
  private constructor(
    readonly workspaceId: string,
    readonly profileId: string,
    readonly details: CompanyDetails,
    readonly owner: CompanyOwner,
    readonly roles: readonly Role[],
    readonly ownerMember: TeamMember,
    readonly createdAt: Date,
  ) {}

  static start(input: {
    workspaceId: string;
    details: CompanyDetails;
    owner: CompanyOwner;
    /** The Company's own copy of the seed Roles (ADR CM-0030 §5). */
    roles: readonly Role[];
    now: Date;
  }): NewCompany {
    const ownerMember = TeamMember.owner({
      id: newId(input.now.getTime()),
      workspaceId: input.workspaceId,
      userId: input.owner.userId,
      details: teamMemberDetails({
        name: input.owner.name,
        mobile: input.owner.mobile,
        email: input.owner.email,
      }),
      now: input.now,
    });
    return new NewCompany(
      input.workspaceId,
      newId(input.now.getTime()),
      input.details,
      input.owner,
      input.roles,
      ownerMember,
      input.now,
    );
  }

  createdEvent(): CompanyCreated {
    return {
      type: "CompanyCreated",
      workspaceId: this.workspaceId,
      ownerUserId: this.owner.userId,
      country: this.details.value.country,
      occurredAt: this.createdAt,
    };
  }
}
