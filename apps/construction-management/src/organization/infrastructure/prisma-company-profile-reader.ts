import type { PrismaClient } from "@repo/construction-db";

import type { CompanyProfileReader } from "../application/company-profile-reader";
import type { CompanyProfile } from "../domain/company-profile";

export class PrismaCompanyProfileReader implements CompanyProfileReader {
  constructor(private readonly db: PrismaClient) {}

  async findByWorkspace(workspaceId: string): Promise<CompanyProfile | null> {
    const row = await this.db.constructionOrganizationCompanyProfile.findFirst({
      where: { workspaceId, deletedAt: null },
    });
    if (row == null) return null;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      mobile: row.mobile,
      email: row.email,
      country: row.country,
      gstin: row.gstin,
      pan: row.pan,
      address: row.address,
      currency: row.currency,
      isIndian: row.isIndian,
      timezone: row.timezone,
      logoKey: row.logoKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
