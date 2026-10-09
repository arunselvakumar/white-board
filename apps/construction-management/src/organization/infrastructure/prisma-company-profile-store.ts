import type { PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import { profileChanged } from "../application/company-profile-handlers";
import type {
  CompanyProfileStore,
  StoredFileChange,
} from "../application/company-profile-store";
import type { CompanyProfile } from "../domain/company-profile";
import { PrismaCompanyProfileReader } from "./prisma-company-profile-reader";

export class PrismaCompanyProfileStore
  extends PrismaCompanyProfileReader
  implements CompanyProfileStore
{
  constructor(private readonly client: PrismaClient) {
    super(client);
  }

  async save(
    profile: CompanyProfile,
    change: { loadedAt: Date; audit: AuditEvent; files?: StoredFileChange },
  ): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const written =
        await tx.constructionOrganizationCompanyProfile.updateMany({
          where: {
            id: profile.id,
            workspaceId: profile.workspaceId,
            updatedAt: change.loadedAt,
            deletedAt: null,
          },
          data: {
            name: profile.name,
            mobile: profile.mobile,
            email: profile.email,
            gstin: profile.gstin,
            pan: profile.pan,
            address: profile.address,
            currency: profile.currency,
            isIndian: profile.isIndian,
            timezone: profile.timezone,
            logoKey: profile.logoKey,
            updatedAt: profile.updatedAt,
            updatedBy: change.audit.actorUserId,
          },
        });
      if (written.count === 0) throw profileChanged();
      if (change.files?.removedKey != null)
        await markStoredFileDeleted(
          tx,
          profile.workspaceId,
          change.files.removedKey,
          profile.updatedAt,
        );
      if (change.files?.added != null)
        await recordStoredFile(tx, change.files.added);
      await recordAudit(tx, change.audit);
    });
  }
}
