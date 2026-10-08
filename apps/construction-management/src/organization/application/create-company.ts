import type { EventDispatcher } from "@/src/shared-kernel/events";

import { CompanyDetails } from "../domain/company-details";
import type { Designation } from "../domain/designation";
import { NewCompany } from "../domain/new-company";
import type { CompanyDirectory } from "./company-directory";
import type { NewCompanyStore } from "./new-company-store";

export type CreateCompanyCommand = {
  name: string;
  mobile?: string | null;
  email?: string | null;
  country: string;
  currency?: string | null;
  gstin?: string | null;
  pan?: string | null;
  address?: string | null;
  /** The signed-in User, who becomes the Owner. */
  userId: string;
  userName: string;
  userMobile: string | null;
  userEmail: string | null;
};

/** Copies a seed set for a new Company (CM-106; more sets arrive with M2/M4). */
export type SeedDesignations = (input: {
  workspaceId: string;
  by: string;
  now: Date;
}) => Designation[];

export type CreatedCompany = {
  workspaceId: string;
  name: string;
  trialEndsAt: Date;
};

/**
 * Company creation (CM-104): the Workspace in `@repo/auth` with the caller
 * as Owner, then the profile, the Owner's Team Member, the seed sets and the
 * trial in one transaction. If that transaction fails the Workspace is
 * removed again, so a half-made Company never appears in the switcher.
 */
export class CreateCompanyHandler {
  constructor(
    private readonly directory: CompanyDirectory,
    private readonly store: NewCompanyStore,
    private readonly seedDesignations: SeedDesignations,
    private readonly events: EventDispatcher,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(command: CreateCompanyCommand): Promise<CreatedCompany> {
    const details = CompanyDetails.create(command);
    const { workspaceId } = await this.directory.createWorkspace({
      name: details.value.name,
      ownerUserId: command.userId,
    });
    const now = this.clock();
    const company = NewCompany.start({
      workspaceId,
      details,
      designations: this.seedDesignations({
        workspaceId,
        by: command.userId,
        now,
      }),
      owner: {
        userId: command.userId,
        name: command.userName,
        mobile: command.userMobile,
        email: command.userEmail,
      },
      now,
    });
    try {
      await this.store.create(company);
    } catch (error) {
      await this.directory.deleteWorkspace(workspaceId);
      throw error;
    }
    await this.events.dispatch([company.createdEvent()]);
    return {
      workspaceId,
      name: details.value.name,
      trialEndsAt: company.trial.endsAt,
    };
  }
}
