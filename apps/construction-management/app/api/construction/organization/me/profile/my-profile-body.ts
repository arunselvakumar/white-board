import type { MyProfile } from "@/src/organization/application/my-profile-handlers";
import { fileVersion } from "@/src/shared-kernel/files";

import type { GetConstructionOrganizationMyProfileResponseModel } from "./get-my-profile-response-model";

export const MY_PHOTO_PATH = "/api/construction/organization/me/photo";

export function myProfileBody(
  profile: MyProfile,
): GetConstructionOrganizationMyProfileResponseModel {
  return {
    id: profile.id,
    name: profile.name,
    designation: profile.designation,
    mobile: profile.mobile,
    mobileEditable: profile.mobileEditable,
    email: profile.email,
    address: profile.address,
    emergencyContact: profile.emergencyContact,
    aadhaarMasked: profile.aadhaarMasked,
    panMasked: profile.panMasked,
    memberType: profile.memberType,
    isOwner: profile.isOwner,
    photoUrl:
      profile.photoKey == null
        ? null
        : `${MY_PHOTO_PATH}?v=${fileVersion(profile.photoKey)}`,
    updatedAt: profile.updatedAt.toISOString(),
  };
}
