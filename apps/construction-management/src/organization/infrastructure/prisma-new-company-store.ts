import type { PrismaClient } from "@repo/db";

import { recordAudit } from "@/src/shared-kernel/audit";

import type { NewCompanyStore } from "../application/new-company-store";
import type { NewCompany } from "../domain/new-company";
import { insertDesignations } from "./prisma-designation-repository";
import type { PrismaTeamMemberRepository } from "./prisma-team-member-repository";

export class PrismaNewCompanyStore implements NewCompanyStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly members: PrismaTeamMemberRepository,
  ) {}

  async create(company: NewCompany): Promise<void> {
    const details = company.details.value;
    const ownerId = company.owner.userId;
    await this.db.$transaction(async (tx) => {
      await tx.constructionOrganizationCompanyProfile.create({
        data: {
          id: company.profileId,
          workspaceId: company.workspaceId,
          name: details.name,
          mobile: details.mobile,
          email: details.email,
          country: details.country,
          currency: details.currency,
          isIndian: company.details.isIndian,
          gstin: details.gstin,
          pan: details.pan,
          address: details.address,
          timezone: details.timezone,
          createdAt: company.createdAt,
          updatedAt: company.createdAt,
          createdBy: ownerId,
          updatedBy: ownerId,
        },
      });
      await tx.constructionOrganizationSubscription.create({
        data: {
          id: company.trial.id,
          workspaceId: company.workspaceId,
          planCode: company.trial.planCode,
          isTrial: true,
          startsAt: company.trial.startsAt,
          endsAt: company.trial.endsAt,
        },
      });
      await insertDesignations(tx, company.designations);
      await this.members.write(tx, company.ownerMember);
      await recordAudit(tx, {
        workspaceId: company.workspaceId,
        actorUserId: ownerId,
        action: "company.created",
        entityType: "company",
        entityId: company.workspaceId,
        after: { ...details, trialEndsAt: company.trial.endsAt },
        occurredAt: company.createdAt,
      });
    });
  }
}
