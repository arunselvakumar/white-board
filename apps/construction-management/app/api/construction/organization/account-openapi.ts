import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ACTION_CODES_PATH,
  RequestConstructionOrganizationActionCodeRequestModel,
  VerifyConstructionOrganizationActionCodeRequestModel,
} from "./action-codes/action-code-models";
import {
  COMPANY_DELETION_PATH,
  GetConstructionOrganizationCompanyDeletionResponseModel,
  ScheduleConstructionOrganizationCompanyDeletionRequestModel,
  ScheduleConstructionOrganizationCompanyDeletionResponseModel,
} from "./company-deletion/company-deletion-models";
import {
  ACCOUNT_PATH,
  DeleteConstructionOrganizationMyAccountRequestModel,
  GetConstructionOrganizationMyAccountResponseModel,
} from "./me/account/account-models";
import {
  ConstructionOrganizationDeviceParamsModel,
  DEVICES_PATH,
  ListConstructionOrganizationDevicesResponseModel,
  SignOutConstructionOrganizationOtherDevicesResponseModel,
} from "./me/devices/device-models";
import {
  ListConstructionOrganizationOwnershipCandidatesResponseModel,
  OWNERSHIP_PATH,
  TransferConstructionOrganizationOwnershipRequestModel,
  TransferConstructionOrganizationOwnershipResponseModel,
} from "./ownership/ownership-models";

const ACCOUNT = ["Construction · Account"];
const UNAUTHENTICATED = [StatusCodes.UNAUTHORIZED];
const SESSION_ERRORS = [StatusCodes.UNAUTHORIZED, StatusCodes.FORBIDDEN];
const CODE_ERRORS = [StatusCodes.BAD_REQUEST, StatusCodes.TOO_MANY_REQUESTS];

/**
 * Action codes, Devices, Transfer ownership, Delete My Account and Delete
 * Company (CM-907, ADR CM-0021 §9–§11).
 */
export const accountOpenApiComponents: OpenApiComponents = {
  RequestConstructionOrganizationActionCodeRequestModel,
  VerifyConstructionOrganizationActionCodeRequestModel,
  ListConstructionOrganizationDevicesResponseModel,
  ConstructionOrganizationDeviceParamsModel,
  SignOutConstructionOrganizationOtherDevicesResponseModel,
  GetConstructionOrganizationMyAccountResponseModel,
  DeleteConstructionOrganizationMyAccountRequestModel,
  ListConstructionOrganizationOwnershipCandidatesResponseModel,
  TransferConstructionOrganizationOwnershipRequestModel,
  TransferConstructionOrganizationOwnershipResponseModel,
  GetConstructionOrganizationCompanyDeletionResponseModel,
  ScheduleConstructionOrganizationCompanyDeletionRequestModel,
  ScheduleConstructionOrganizationCompanyDeletionResponseModel,
};

export const accountOpenApiOperations: OpenApiOperation[] = [
  {
    method: "post",
    path: ACTION_CODES_PATH,
    summary:
      "Send the signed-in User a six-digit code for a sensitive action (SMS while SMS is on and they sign in by mobile, else their email). 10 minutes, five tries, once; one per purpose per minute (429 `ACTION_CODE_TOO_SOON`). Company purposes are Owner only (403)",
    tags: ACCOUNT,
    body: RequestConstructionOrganizationActionCodeRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "The code was sent",
    errors: [
      StatusCodes.BAD_REQUEST,
      ...SESSION_ERRORS,
      StatusCodes.CONFLICT,
      StatusCodes.TOO_MANY_REQUESTS,
    ],
  },
  {
    method: "post",
    path: `${ACTION_CODES_PATH}/verify`,
    summary:
      "Verify a `reveal_identifiers` code: this session may reveal full Aadhaar and PAN for 10 minutes. 400 `ACTION_CODE_INVALID` / `ACTION_CODE_EXPIRED` / `ACTION_CODE_NOT_FOUND`, 429 `ACTION_CODE_LOCKED`",
    tags: ACCOUNT,
    body: VerifyConstructionOrganizationActionCodeRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Verified; reveals are open for 10 minutes",
    errors: [...CODE_ERRORS, ...SESSION_ERRORS],
  },
  {
    method: "get",
    path: DEVICES_PATH,
    summary:
      "My Profile → Devices: the signed-in User's sessions (browser and system, signed in, last active, this device, push on), this one first",
    tags: ACCOUNT,
    successStatus: StatusCodes.OK,
    successDescription: "The devices",
    successSchema: ListConstructionOrganizationDevicesResponseModel,
    errors: UNAUTHENTICATED,
  },
  {
    method: "post",
    path: `${DEVICES_PATH}/{id}/sign-out`,
    summary:
      "Sign one other device out and delete its push subscriptions. 404 `DEVICE_NOT_FOUND`; 409 `DEVICE_IS_THIS_ONE`",
    tags: ACCOUNT,
    params: ConstructionOrganizationDeviceParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Signed out",
    errors: [
      StatusCodes.BAD_REQUEST,
      ...UNAUTHENTICATED,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "post",
    path: `${DEVICES_PATH}/sign-out-others`,
    summary:
      "Sign out of every other device and delete their push subscriptions",
    tags: ACCOUNT,
    successStatus: StatusCodes.OK,
    successDescription: "How many devices were signed out",
    successSchema: SignOutConstructionOrganizationOtherDevicesResponseModel,
    errors: UNAUTHENTICATED,
  },
  {
    method: "get",
    path: ACCOUNT_PATH,
    summary:
      "The Companies the signed-in User owns (Delete My Account is refused while there are any)",
    tags: ACCOUNT,
    successStatus: StatusCodes.OK,
    successDescription: "Owned Companies",
    successSchema: GetConstructionOrganizationMyAccountResponseModel,
    errors: UNAUTHENTICATED,
  },
  {
    method: "post",
    path: `${ACCOUNT_PATH}/delete`,
    summary:
      "Delete My Account with a reason, DELETE typed and a `delete_account` code. 409 `OWNER_MUST_HAND_OVER` while the User owns a Company. Leaves every Company (Team Members kept, marked Left, unlinked), deletes sessions, push subscriptions, notifications and preferences, erases the identity, and keeps an `account_deletions` record",
    tags: ACCOUNT,
    body: DeleteConstructionOrganizationMyAccountRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "The account is deleted and signed out",
    errors: [...CODE_ERRORS, ...UNAUTHENTICATED, StatusCodes.CONFLICT],
  },
  {
    method: "get",
    path: `${OWNERSHIP_PATH}/candidates`,
    summary:
      "Who the Owner may hand the Company to: active, joined, Normal Team Members. Owner only",
    tags: ACCOUNT,
    successStatus: StatusCodes.OK,
    successDescription: "Team Members by name",
    successSchema: ListConstructionOrganizationOwnershipCandidatesResponseModel,
    errors: SESSION_ERRORS,
  },
  {
    method: "post",
    path: `${OWNERSHIP_PATH}/transfer`,
    summary:
      "Transfer ownership with a `transfer_ownership` code (Owner only): the Team Member becomes `owner`; the caller becomes a `member` on the Admin Role. 409 `NEW_OWNER_NOT_ACTIVE` / `OWNER_IS_NORMAL`; 409 `COMPANY_DELETION_SCHEDULED` during a deletion's cooling-off",
    tags: ACCOUNT,
    body: TransferConstructionOrganizationOwnershipRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The new Owner",
    successSchema: TransferConstructionOrganizationOwnershipResponseModel,
    errors: [
      ...CODE_ERRORS,
      ...SESSION_ERRORS,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
    ],
  },
  {
    method: "get",
    path: COMPANY_DELETION_PATH,
    summary: "The Active Company's pending deletion, or null (any member)",
    tags: ACCOUNT,
    successStatus: StatusCodes.OK,
    successDescription: "The pending deletion",
    successSchema: GetConstructionOrganizationCompanyDeletionResponseModel,
    errors: SESSION_ERRORS,
  },
  {
    method: "post",
    path: COMPANY_DELETION_PATH,
    summary:
      "Delete Company (Owner only): the name typed and a `delete_company` code schedule the deletion 30 days ahead. Until then writes answer 409 `COMPANY_DELETION_SCHEDULED` (reads, reports, backups and exports stay open); then the daily job deletes every row, file, membership and the Workspace, keeping the `company_deletions` record and the GST invoices. 400 `COMPANY_NAME_MISMATCH`",
    tags: ACCOUNT,
    body: ScheduleConstructionOrganizationCompanyDeletionRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "Scheduled",
    successSchema: ScheduleConstructionOrganizationCompanyDeletionResponseModel,
    errors: [...CODE_ERRORS, ...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
  {
    method: "post",
    path: `${COMPANY_DELETION_PATH}/cancel`,
    summary:
      "Cancel the Company's pending deletion (Owner only). 409 `NO_COMPANY_DELETION`",
    tags: ACCOUNT,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Cancelled; the Company is writable again",
    errors: [...SESSION_ERRORS, StatusCodes.CONFLICT],
  },
];
