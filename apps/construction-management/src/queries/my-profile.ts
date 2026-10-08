import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionOrganizationMyProfileResponseModel } from "@/app/api/construction/organization/me/profile/get-my-profile-response-model";
import type { RevealConstructionOrganizationMyIdentifiersResponseModel } from "@/app/api/construction/organization/me/profile/reveal-identifiers/reveal-my-identifiers-response-model";
import type { UpdateConstructionOrganizationMyProfileRequestModel } from "@/app/api/construction/organization/me/profile/update/update-my-profile-request-model";

import { apiJson } from "./http";

const BASE = "/api/construction/organization/me";

export type MyProfileModel = GetConstructionOrganizationMyProfileResponseModel;

/** The signed-in User's Team Member record in the Active Company. */
export const myProfileQuery = queryOptions({
  queryKey: ["organization", "me", "profile"],
  queryFn: () => apiJson<MyProfileModel>(`${BASE}/profile`),
});

export function updateMyProfile(
  input: UpdateConstructionOrganizationMyProfileRequestModel,
): Promise<MyProfileModel> {
  return apiJson(`${BASE}/profile/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function revealMyIdentifiers(): Promise<RevealConstructionOrganizationMyIdentifiersResponseModel> {
  return apiJson(`${BASE}/profile/reveal-identifiers`, { method: "POST" });
}

/** The file itself is the body; the server checks type and size again. */
export function uploadMyPhoto(file: File): Promise<MyProfileModel> {
  return apiJson(`${BASE}/photo`, {
    method: "POST",
    headers: { "content-type": file.type },
    body: file,
  });
}

export function removeMyPhoto(): Promise<MyProfileModel> {
  return apiJson(`${BASE}/photo/remove`, { method: "POST" });
}
