import { notFound } from "@/src/shared-kernel/domain-error";

import type { CompanyProfile } from "../domain/company-profile";
import type { CompanyProfileReader } from "./company-profile-reader";

export type GetCompanyProfileQuery = { workspaceId: string };

export class GetCompanyProfileHandler {
  constructor(private readonly profiles: CompanyProfileReader) {}

  async execute(query: GetCompanyProfileQuery): Promise<CompanyProfile> {
    const profile = await this.profiles.findByWorkspace(query.workspaceId);
    if (profile == null)
      throw notFound(
        "COMPANY_PROFILE_NOT_FOUND",
        "This Company has no profile yet.",
      );
    return profile;
  }
}
