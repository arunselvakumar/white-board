import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionOrganizationCompanyDeletionResponseModel } from "@/app/api/construction/organization/company-deletion/company-deletion-models";
import type {
  DeleteConstructionOrganizationMyAccountRequestModel,
  GetConstructionOrganizationMyAccountResponseModel,
} from "@/app/api/construction/organization/me/account/account-models";
import type {
  ListConstructionOrganizationDevicesResponseModel,
  SignOutConstructionOrganizationOtherDevicesResponseModel,
} from "@/app/api/construction/organization/me/devices/device-models";
import type {
  ListConstructionOrganizationOwnershipCandidatesResponseModel,
  TransferConstructionOrganizationOwnershipRequestModel,
} from "@/app/api/construction/organization/ownership/ownership-models";
import type { ActionCodePurpose } from "@/src/shared-kernel/action-code-rules";

import { apiJson } from "./http";

const ORG = "/api/construction/organization";

export type DeviceItem =
  ListConstructionOrganizationDevicesResponseModel["items"][number];
export type MyAccountModel = GetConstructionOrganizationMyAccountResponseModel;
export type CompanyDeletionModel =
  GetConstructionOrganizationCompanyDeletionResponseModel["deletion"];
export type OwnershipCandidate =
  ListConstructionOrganizationOwnershipCandidatesResponseModel["items"][number];

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(`${ORG}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export const accountQueries = {
  key: {
    devices: ["organization", "me", "devices"] as const,
    account: ["organization", "me", "account"] as const,
    deletion: ["organization", "company-deletion"] as const,
    candidates: ["organization", "ownership", "candidates"] as const,
  },
  /** My Profile → Devices (CM-907). */
  devices: () =>
    queryOptions({
      queryKey: accountQueries.key.devices,
      queryFn: () =>
        apiJson<ListConstructionOrganizationDevicesResponseModel>(
          `${ORG}/me/devices`,
        ),
    }),
  /** The Companies the User owns, before Delete My Account. */
  account: () =>
    queryOptions({
      queryKey: accountQueries.key.account,
      queryFn: () => apiJson<MyAccountModel>(`${ORG}/me/account`),
    }),
  /** The Active Company's pending deletion, for the banner. */
  deletion: () =>
    queryOptions({
      queryKey: accountQueries.key.deletion,
      queryFn: () =>
        apiJson<GetConstructionOrganizationCompanyDeletionResponseModel>(
          `${ORG}/company-deletion`,
        ),
    }),
  /** Who the Owner may hand the Company to. */
  candidates: () =>
    queryOptions({
      queryKey: accountQueries.key.candidates,
      queryFn: () =>
        apiJson<ListConstructionOrganizationOwnershipCandidatesResponseModel>(
          `${ORG}/ownership/candidates`,
        ),
    }),
};

/** Sends a six-digit code for the purpose to the signed-in User. */
export function requestActionCode(purpose: ActionCodePurpose): Promise<void> {
  return post(`/action-codes`, { purpose });
}

/** Opens 10 minutes of Aadhaar and PAN reveals in this session. */
export function verifyRevealCode(code: string): Promise<void> {
  return post(`/action-codes/verify`, {
    purpose: "reveal_identifiers",
    code,
  });
}

export function signOutDevice(id: string): Promise<void> {
  return post(`/me/devices/${encodeURIComponent(id)}/sign-out`);
}

export function signOutOtherDevices(): Promise<SignOutConstructionOrganizationOtherDevicesResponseModel> {
  return post(`/me/devices/sign-out-others`);
}

export function deleteMyAccount(
  body: DeleteConstructionOrganizationMyAccountRequestModel,
): Promise<void> {
  return post(`/me/account/delete`, body);
}

export function transferOwnership(
  body: TransferConstructionOrganizationOwnershipRequestModel,
): Promise<{ ownerId: string }> {
  return post(`/ownership/transfer`, body);
}

export function scheduleCompanyDeletion(body: {
  companyName: string;
  code: string;
}): Promise<NonNullable<CompanyDeletionModel>> {
  return post(`/company-deletion`, body);
}

export function cancelCompanyDeletion(): Promise<void> {
  return post(`/company-deletion/cancel`);
}

/** "15 Nov 2026" in India time. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}
