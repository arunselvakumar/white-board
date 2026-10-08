import { newId } from "@/src/shared-kernel/ids";

import type { CompanyDetails } from "./company-details";
import type { CompanyCreated } from "./events";
import { TRIAL_PLAN_CODE, trialEndsAt } from "./trial";

export type CompanyOwner = {
  userId: string;
  name: string;
  mobile: string | null;
  email: string | null;
};

export type TrialSubscription = {
  id: string;
  planCode: string;
  isTrial: true;
  startsAt: Date;
  endsAt: Date;
};

/**
 * Everything written when a Company is created (CM-104): its profile, its
 * Owner, and its trial. The Workspace itself already exists in `@repo/auth`.
 */
export class NewCompany {
  private constructor(
    readonly workspaceId: string,
    readonly profileId: string,
    readonly details: CompanyDetails,
    readonly owner: CompanyOwner,
    readonly trial: TrialSubscription,
    readonly createdAt: Date,
  ) {}

  static start(input: {
    workspaceId: string;
    details: CompanyDetails;
    owner: CompanyOwner;
    now: Date;
  }): NewCompany {
    return new NewCompany(
      input.workspaceId,
      newId(input.now.getTime()),
      input.details,
      input.owner,
      {
        id: newId(input.now.getTime()),
        planCode: TRIAL_PLAN_CODE,
        isTrial: true,
        startsAt: input.now,
        endsAt: trialEndsAt(input.now),
      },
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
