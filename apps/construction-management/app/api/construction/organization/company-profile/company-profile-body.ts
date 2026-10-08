import type { CompanyProfile } from "@/src/organization/domain/company-profile";
import { can, type MemberAccess } from "@/src/shared-kernel/access";
import { fileVersion } from "@/src/shared-kernel/files";

import type { GetConstructionOrganizationCompanyProfileResponseModel } from "./get-company-profile-response-model";

export const COMPANY_LOGO_PATH =
  "/api/construction/organization/company-profile/logo";

export function companyProfileBody(
  profile: CompanyProfile,
  access: MemberAccess,
): GetConstructionOrganizationCompanyProfileResponseModel {
  return {
    id: profile.id,
    name: profile.name,
    mobile: profile.mobile,
    email: profile.email,
    country: profile.country,
    gstin: profile.gstin,
    pan: profile.pan,
    address: profile.address,
    currency: profile.currency,
    isIndian: profile.isIndian,
    timezone: profile.timezone,
    logoUrl:
      profile.logoKey == null
        ? null
        : `${COMPANY_LOGO_PATH}?v=${fileVersion(profile.logoKey)}`,
    canUpdate: can(access, "organization.settings", "update"),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
